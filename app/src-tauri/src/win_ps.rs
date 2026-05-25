//! Run PowerShell without flashing a console window (CREATE_NO_WINDOW).

#[cfg(windows)]
pub fn run(script: &str) -> std::io::Result<std::process::Output> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
}

#[cfg(not(windows))]
pub fn run(_script: &str) -> std::io::Result<std::process::Output> {
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "PowerShell helpers are Windows-only",
    ))
}
