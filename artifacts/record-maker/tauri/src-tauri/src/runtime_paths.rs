//! Keep canonical paths for access checks, but use normal Windows paths at the
//! Node CLI boundary. Node's CommonJS entry-point resolution does not reliably
//! support the verbatim paths returned by Windows canonicalize().
use std::path::{Component, Path, PathBuf, Prefix};

pub fn node_argument(path: &Path) -> PathBuf {
    let mut components = path.components();
    match components.next() {
        Some(Component::Prefix(prefix)) => match prefix.kind() {
            Prefix::VerbatimDisk(drive) => {
                let mut normal = PathBuf::from(format!("{}:\\", drive as char));
                normal.push(components.as_path());
                normal
            }
            Prefix::VerbatimUNC(server, share) => {
                let mut normal = PathBuf::from(r"\\");
                normal.push(server);
                normal.push(share);
                normal.push(components.as_path());
                normal
            }
            _ => path.to_path_buf(),
        },
        _ => path.to_path_buf(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ordinary_paths_are_not_rewritten() {
        let path = Path::new("fixture directory/service-host.cjs");
        assert_eq!(node_argument(path), path);
    }

    #[cfg(windows)]
    #[test]
    fn canonical_windows_paths_become_node_cli_paths_without_losing_unicode() {
        for (input, expected) in [
            (r"\\?\D:\college records\विद्यार्थी\service-host.cjs", r"D:\college records\विद्यार्थी\service-host.cjs"),
            (r"\\?\UNC\server\share\college records", r"\\server\share\college records"),
            (r"D:\ordinary\service-host.cjs", r"D:\ordinary\service-host.cjs"),
        ] {
            assert_eq!(node_argument(Path::new(input)), Path::new(expected));
        }
    }
}
