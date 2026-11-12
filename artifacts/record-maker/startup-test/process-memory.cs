// .NET Framework, no WMI/PowerShell polling or process names written to logs.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

class ProcessMemory {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct ENTRY {
        public uint size, usage, pid; public UIntPtr heap;
        public uint module, threads, parent; public int priority; public uint flags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string name;
    }
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32FirstW(IntPtr handle, ref ENTRY entry);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool Process32NextW(IntPtr handle, ref ENTRY entry);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    static HashSet<int> Tree(int root) {
        var result = new HashSet<int>(); result.Add(root);
        var parents = new Dictionary<int,int>();
        IntPtr snapshot = CreateToolhelp32Snapshot(2, 0);
        if (snapshot == new IntPtr(-1)) throw new IOException();
        try {
            var entry = new ENTRY(); entry.size = (uint)Marshal.SizeOf(typeof(ENTRY));
            if (!Process32FirstW(snapshot, ref entry)) throw new IOException();
            do { parents[(int)entry.pid] = (int)entry.parent; } while (Process32NextW(snapshot, ref entry));
        } finally { CloseHandle(snapshot); }
        bool changed;
        do {
            changed = false;
            foreach (var item in parents) if (result.Contains(item.Value) && result.Add(item.Key)) changed = true;
        } while (changed);
        return result;
    }
    static int Main(string[] args) {
        int root; long birth;
        if (args.Length != 3 || !int.TryParse(args[0], out root) || !long.TryParse(args[1], out birth)) return 2;
        var output = Path.GetFullPath(args[2]);
        if (Path.GetFileName(output) != "process-memory.jsonl" || !Directory.Exists(Path.GetDirectoryName(output))) return 2;
        var clock = Stopwatch.StartNew();
        try {
            using (var stream = new FileStream(output, FileMode.CreateNew, FileAccess.Write, FileShare.Read))
            using (var writer = new StreamWriter(stream, new UTF8Encoding(false))) {
                writer.AutoFlush = true;
                while (clock.Elapsed.TotalSeconds < 150) {
                    try {
                        using (var owner = Process.GetProcessById(root)) {
                            if (owner.StartTime.ToUniversalTime().Ticks != birth || owner.HasExited) break;
                        }
                        long working = 0, privateBytes = 0; int measured = 0, missing = 0;
                        var ids = Tree(root);
                        foreach (int id in ids) {
                            try {
                                using (var p = Process.GetProcessById(id)) {
                                    // Ignore recycled PIDs older than the test's root process.
                                    if (p.StartTime.ToUniversalTime().Ticks < birth) { missing++; continue; }
                                    working += p.WorkingSet64; privateBytes += p.PrivateMemorySize64; measured++;
                                }
                            } catch { missing++; }
                        }
                        writer.WriteLine("{\"at\":\"" + DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture) +
                            "\",\"event\":\"process-tree-sample\",\"elapsedMs\":" + clock.ElapsedMilliseconds +
                            ",\"status\":\"" + (missing == 0 ? "ok" : "partial") + "\",\"processCount\":" + measured +
                            ",\"unavailableCount\":" + missing + ",\"workingSetBytes\":" + working +
                            ",\"privateBytes\":" + privateBytes + "}");
                    } catch (ArgumentException) { break; }
                    catch {
                        writer.WriteLine("{\"event\":\"process-tree-sample\",\"status\":\"unavailable\",\"workingSetBytes\":null,\"privateBytes\":null}");
                    }
                    if (File.Exists(Path.Combine(Path.GetDirectoryName(output), "process-memory.stop"))) break;
                    Thread.Sleep(2000);
                }
                writer.WriteLine("{\"event\":\"collector-finished\"}");
            }
            return 0;
        } catch { return 2; }
    }
}
