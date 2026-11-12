// Windows-only, opt-in aggregate counters. No process enumeration, record reads,
// file names, command lines, account details, network capture, or elevation.
using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

internal static class StartupTrace
{
    [StructLayout(LayoutKind.Sequential)]
    private struct MemoryStatus
    {
        public uint Length, Load;
        public ulong TotalPhysical, AvailablePhysical, TotalPageFile, AvailablePageFile;
        public ulong TotalVirtual, AvailableVirtual, AvailableExtendedVirtual;
    }
    [StructLayout(LayoutKind.Explicit)]
    private struct CounterValue
    {
        [FieldOffset(0)] public uint Status;
        [FieldOffset(8)] public double Value;
    }
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GlobalMemoryStatusEx(ref MemoryStatus status);
    [DllImport("pdh.dll", CharSet = CharSet.Unicode, EntryPoint = "PdhOpenQueryW", ExactSpelling = true)]
    private static extern uint OpenQuery(string source, IntPtr data, out IntPtr query);
    [DllImport("pdh.dll", CharSet = CharSet.Unicode, EntryPoint = "PdhAddEnglishCounterW", ExactSpelling = true)]
    private static extern uint AddCounter(IntPtr query, string path, IntPtr data, out IntPtr counter);
    [DllImport("pdh.dll", EntryPoint = "PdhCollectQueryData")]
    private static extern uint Collect(IntPtr query);
    [DllImport("pdh.dll", EntryPoint = "PdhGetFormattedCounterValue")]
    private static extern uint ReadCounter(IntPtr counter, uint format, out uint type, out CounterValue value);
    [DllImport("pdh.dll", EntryPoint = "PdhCloseQuery")]
    private static extern uint CloseQuery(IntPtr query);

    private sealed class Metric
    {
        public string Key, Path, Unit;
        public double Scale;
        public IntPtr Handle;
        public uint AddStatus;
        public Metric(string key, string path, string unit, double scale)
        { Key = key; Path = path; Unit = unit; Scale = scale; }
    }
    private static readonly Metric[] Metrics = {
        new Metric("diskReadLatencyMs", @"\PhysicalDisk(_Total)\Avg. Disk sec/Read", "ms", 1000),
        new Metric("diskWriteLatencyMs", @"\PhysicalDisk(_Total)\Avg. Disk sec/Write", "ms", 1000),
        new Metric("diskQueueLength", @"\PhysicalDisk(_Total)\Current Disk Queue Length", "requests", 1),
        new Metric("diskReadsPerSec", @"\PhysicalDisk(_Total)\Disk Reads/sec", "per-second", 1),
        new Metric("diskReadMBPerSec", @"\PhysicalDisk(_Total)\Disk Read Bytes/sec", "MiB-per-second", 1.0 / 1048576),
        new Metric("pagesInputPerSec", @"\Memory\Pages Input/sec", "pages-per-second", 1),
        new Metric("pageReadOperationsPerSec", @"\Memory\Page Reads/sec", "per-second", 1),
        new Metric("pagesOutputPerSec", @"\Memory\Pages Output/sec", "pages-per-second", 1),
        new Metric("committedMB", @"\Memory\Committed Bytes", "MiB", 1.0 / 1048576),
        new Metric("commitLimitMB", @"\Memory\Commit Limit", "MiB", 1.0 / 1048576),
        new Metric("pageFileUsagePercent", @"\Paging File(_Total)\% Usage", "percent", 1),
        new Metric("systemCpuPercent", @"\Processor(_Total)\% Processor Time", "percent", 1)
    };
    private static string Number(double value)
    { return value.ToString("0.###", CultureInfo.InvariantCulture); }
    // Only fixed event/metric/unit labels and fixed-format dates/status codes use Quote.
    private static string Quote(string value)
    { return "\"" + value.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\""; }
    private static string Hex(uint value)
    { return Quote("0x" + value.ToString("X8", CultureInfo.InvariantCulture)); }
    private static string Prefix(string name, Stopwatch clock)
    {
        return "{\"schema\":1,\"event\":" + Quote(name) + ",\"at\":" +
            Quote(DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture)) +
            ",\"elapsedMs\":" + clock.ElapsedMilliseconds;
    }
    private static string Memory()
    {
        MemoryStatus memory = new MemoryStatus();
        memory.Length = (uint)Marshal.SizeOf(typeof(MemoryStatus));
        if (!GlobalMemoryStatusEx(ref memory))
            return "{\"status\":\"unavailable\",\"code\":" + Hex((uint)Marshal.GetLastWin32Error()) + "}";
        return "{\"status\":\"ok\",\"availableMB\":" + Number(memory.AvailablePhysical / 1048576.0) +
            ",\"totalMB\":" + Number(memory.TotalPhysical / 1048576.0) +
            ",\"loadPercent\":" + memory.Load + "}";
    }
    private static string MetricJson(Metric metric, uint collected, bool first)
    {
        string status = "ok"; uint code = 0; double? number = null;
        if (metric.Handle == IntPtr.Zero) { status = "unavailable"; code = metric.AddStatus; }
        else if (collected != 0) { status = "query-error"; code = collected; }
        else if (first) status = "warming-up";
        else {
            uint type; CounterValue value;
            code = ReadCounter(metric.Handle, 0x00000200, out type, out value); // PDH_FMT_DOUBLE
            if (code != 0) status = "unavailable";
            else if (value.Status > 1) { status = "invalid-data"; code = value.Status; }
            else if (Double.IsNaN(value.Value) || Double.IsInfinity(value.Value) || value.Value < 0) status = "invalid-data";
            else number = value.Value * metric.Scale;
        }
        return Quote(metric.Key) + ":{\"status\":" + Quote(status) +
            ",\"unit\":" + Quote(metric.Unit) + ",\"value\":" +
            (number.HasValue ? Number(number.Value) : "null") +
            (code != 0 ? ",\"code\":" + Hex(code) : "") + "}";
    }
    public static int Main(string[] args)
    {
        if (args.Length != 4 || args[0] != "--output" || args[2] != "--seconds") return 2;
        int seconds;
        if (!Int32.TryParse(args[3], out seconds) || seconds < 3 || seconds > 150) return 2;
        string output;
        try {
            output = Path.GetFullPath(args[1]);
            if (Path.GetFileName(output) != "windows-counters.jsonl" ||
                !Directory.Exists(Path.GetDirectoryName(output))) return 2;
        } catch { return 2; }
        string stop = Path.Combine(Path.GetDirectoryName(output), "windows-counters.stop");
        IntPtr query = IntPtr.Zero;
        // Independent of the sampling loop: end this collector if a native call
        // stalls. The launcher additionally stops only this collector's own PID.
        using (Timer watchdog = new Timer(delegate(object unused) { Environment.Exit(3); },
            null, (seconds + 10) * 1000, Timeout.Infinite))
        try {
            using (FileStream file = new FileStream(output, FileMode.CreateNew, FileAccess.Write, FileShare.Read))
            using (StreamWriter writer = new StreamWriter(file, new UTF8Encoding(false))) {
                writer.AutoFlush = true;
                Stopwatch clock = Stopwatch.StartNew();
                writer.WriteLine(Prefix("collector-start", clock) +
                    ",\"sampleIntervalMs\":2000,\"maxSeconds\":" + seconds +
                    ",\"diskScope\":\"all-physical-disks\",\"memory\":" + Memory() + "}");
                uint opened = OpenQuery(null, IntPtr.Zero, out query);
                if (opened != 0) query = IntPtr.Zero;
                foreach (Metric metric in Metrics) {
                    metric.AddStatus = opened == 0
                        ? AddCounter(query, metric.Path, IntPtr.Zero, out metric.Handle) : opened;
                }
                bool first = true;
                string reason = "duration-limit";
                while (first || clock.Elapsed.TotalSeconds < seconds) {
                    if (File.Exists(stop)) { reason = "stop-requested"; break; }
                    uint collected = query == IntPtr.Zero ? opened : Collect(query);
                    StringBuilder row = new StringBuilder(Prefix("sample", clock));
                    row.Append(",\"memory\":").Append(Memory()).Append(",\"counters\":{");
                    for (int index = 0; index < Metrics.Length; index++) {
                        if (index != 0) row.Append(',');
                        row.Append(MetricJson(Metrics[index], collected, first));
                    }
                    using (Process self = Process.GetCurrentProcess()) {
                        row.Append("},\"collector\":{\"workingSetMB\":").Append(Number(self.WorkingSet64 / 1048576.0))
                            .Append(",\"cpuMs\":").Append(Number(self.TotalProcessorTime.TotalMilliseconds)).Append("}}");
                    }
                    writer.WriteLine(row.ToString());
                    if (first) { Console.WriteLine("READY"); Console.Out.Flush(); first = false; }
                    int wait = Math.Min(2000, Math.Max(0, seconds * 1000 - (int)clock.ElapsedMilliseconds));
                    if (wait > 0) Thread.Sleep(wait);
                }
                writer.WriteLine(Prefix("collector-finished", clock) + ",\"reason\":" + Quote(reason) + "}");
            }
            return 0;
        } catch {
            // Never echo raw exceptions: they may contain private Windows paths.
            Console.Error.WriteLine("Windows counter collector unavailable.");
            return 2;
        } finally {
            if (query != IntPtr.Zero) CloseQuery(query);
        }
    }
}
