//! Small secrets kept for the person on this computer: the sign-in. On
//! Windows they live in the app's own folder, never the notes folder (which
//! may be synced), one file each, encrypted with DPAPI, tied to this Windows
//! account: a copy taken to another computer or account is useless. macOS
//! keeps them in the Keychain, and Linux in the Secret Service (GNOME
//! Keyring, KWallet); where Linux has none running, they go in a file only
//! this user can read. The WebView's storage never holds the sign-in.

use crate::db::{Error, Result};
use std::fs;
use std::io::ErrorKind;
use std::path::PathBuf;

/// Mixed into the encryption, so the file can't be decrypted without it.
#[cfg(windows)]
const ENTROPY: &[u8] = b"thoughtdesk.secrets.v1";

/// Names are file names: letters, digits, '.', '_' and '-', not starting with a dot.
fn valid(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && !name.starts_with('.')
        && name.bytes().all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
}

pub struct Secrets {
    dir: PathBuf,
}

impl Secrets {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }

    fn path(&self, name: &str) -> Result<PathBuf> {
        if !valid(name) {
            return Err(Error(format!("Not a secret's name: {name}")));
        }
        Ok(self.dir.join(format!("{name}.bin")))
    }

    pub fn get(&self, name: &str) -> Result<Option<String>> {
        let path = self.path(name)?;
        #[cfg(any(target_os = "macos", target_os = "linux"))]
        if let Some(value) = keystore::get(name) {
            return Ok(Some(value));
        }
        let sealed = match fs::read(&path) {
            Ok(bytes) => bytes,
            Err(e) if e.kind() == ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(Error(e.to_string())),
        };
        match unseal(&sealed).and_then(|plain| String::from_utf8(plain).ok()) {
            Some(value) => Ok(Some(value)),
            // Damaged, or another Windows account's: forget it (signing in again makes a new one).
            None => {
                let _ = fs::remove_file(&path);
                Ok(None)
            }
        }
    }

    pub fn set(&self, name: &str, value: &str) -> Result<()> {
        let path = self.path(name)?;
        #[cfg(any(target_os = "macos", target_os = "linux"))]
        if keystore::set(name, value) {
            // A copy left from a time without a keystore goes.
            let _ = fs::remove_file(&path);
            return Ok(());
        }
        fs::create_dir_all(&self.dir).map_err(|e| Error(e.to_string()))?;
        let sealed = seal(value.as_bytes()).ok_or_else(|| Error("Windows couldn't encrypt the sign-in".into()))?;
        // Written whole, then moved into place, so a crash never leaves half a file.
        let tmp = path.with_extension("tmp");
        fs::write(&tmp, sealed).map_err(|e| Error(e.to_string()))?;
        // Only this user may read it (on Windows, the encryption does that).
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&tmp, fs::Permissions::from_mode(0o600)).map_err(|e| Error(e.to_string()))?;
        }
        fs::rename(&tmp, &path).map_err(|e| Error(e.to_string()))
    }

    pub fn remove(&self, name: &str) -> Result<()> {
        #[cfg(any(target_os = "macos", target_os = "linux"))]
        keystore::remove(name);
        match fs::remove_file(self.path(name)?) {
            Err(e) if e.kind() != ErrorKind::NotFound => Err(Error(e.to_string())),
            _ => Ok(()),
        }
    }
}

#[cfg(windows)]
fn seal(plain: &[u8]) -> Option<Vec<u8>> {
    dpapi(plain, true)
}

#[cfg(windows)]
fn unseal(sealed: &[u8]) -> Option<Vec<u8>> {
    dpapi(sealed, false)
}

/// Encrypts (or decrypts) for the current Windows account, never asking anything on screen.
#[cfg(windows)]
fn dpapi(input: &[u8], protect: bool) -> Option<Vec<u8>> {
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB};

    let data = CRYPT_INTEGER_BLOB { cbData: u32::try_from(input.len()).ok()?, pbData: input.as_ptr() as *mut u8 };
    let entropy = CRYPT_INTEGER_BLOB { cbData: ENTROPY.len() as u32, pbData: ENTROPY.as_ptr() as *mut u8 };
    let mut out = CRYPT_INTEGER_BLOB { cbData: 0, pbData: null_mut() };
    // SAFETY: the blobs point at live slices, and DPAPI only reads them; it
    // allocates `out`, which is copied and then freed with LocalFree.
    let ok = unsafe {
        if protect {
            CryptProtectData(&data, null(), &entropy, null(), null(), CRYPTPROTECT_UI_FORBIDDEN, &mut out)
        } else {
            CryptUnprotectData(&data, null_mut(), &entropy, null(), null(), CRYPTPROTECT_UI_FORBIDDEN, &mut out)
        }
    };
    if ok == 0 || out.pbData.is_null() {
        return None;
    }
    let bytes = unsafe { std::slice::from_raw_parts(out.pbData, out.cbData as usize) }.to_vec();
    unsafe { LocalFree(out.pbData as _) };
    Some(bytes)
}

/// The system's own keystore: the Keychain on macOS, the Secret Service on
/// Linux. When it has nothing, or there's no keystore to use, the file is
/// looked at instead.
#[cfg(any(target_os = "macos", target_os = "linux"))]
mod keystore {
    use keyring::Entry;

    /// Who the entries belong to in the keystore, as the app's identifier.
    const SERVICE: &str = "app.thoughtdesk.desktop";

    pub fn get(name: &str) -> Option<String> {
        Entry::new(SERVICE, name).and_then(|e| e.get_password()).ok()
    }

    pub fn set(name: &str, value: &str) -> bool {
        Entry::new(SERVICE, name).and_then(|e| e.set_password(value)).is_ok()
    }

    pub fn remove(name: &str) {
        let _ = Entry::new(SERVICE, name).and_then(|e| e.delete_credential());
    }
}

/// Outside Windows the file is the fallback, kept as it is: it's readable by
/// this user only.
#[cfg(not(windows))]
fn seal(plain: &[u8]) -> Option<Vec<u8>> {
    Some(plain.to_vec())
}

#[cfg(not(windows))]
fn unseal(sealed: &[u8]) -> Option<Vec<u8>> {
    Some(sealed.to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh() -> (Secrets, PathBuf) {
        let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let dir = std::env::temp_dir().join(format!("td-secrets-{}-{nanos}", std::process::id()));
        (Secrets::new(dir.clone()), dir)
    }

    #[test]
    fn keeps_replaces_and_forgets_a_secret() {
        let (secrets, dir) = fresh();
        assert_eq!(secrets.get("td-test.auth").unwrap(), None);
        secrets.set("td-test.auth", r#"{"refresh_token":"r1"}"#).unwrap();
        assert_eq!(secrets.get("td-test.auth").unwrap().as_deref(), Some(r#"{"refresh_token":"r1"}"#));
        secrets.set("td-test.auth", "second").unwrap();
        assert_eq!(secrets.get("td-test.auth").unwrap().as_deref(), Some("second"));
        secrets.remove("td-test.auth").unwrap();
        assert_eq!(secrets.get("td-test.auth").unwrap(), None);
        secrets.remove("td-test.auth").unwrap();
        let _ = fs::remove_dir_all(dir);
    }

    #[cfg(windows)]
    #[test]
    fn the_file_is_encrypted_and_a_damaged_one_is_forgotten() {
        let (secrets, dir) = fresh();
        secrets.set("td-test.auth", "refresh-token-in-plain-sight").unwrap();
        let file = dir.join("td-test.auth.bin");
        let raw = fs::read(&file).unwrap();
        assert!(!raw.windows(13).any(|w| w == b"refresh-token"), "not stored in plain text");
        fs::write(&file, b"not something DPAPI made").unwrap();
        assert_eq!(secrets.get("td-test.auth").unwrap(), None);
        assert!(!file.exists(), "a file that can't be read is removed");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn names_stay_inside_the_folder() {
        let (secrets, _) = fresh();
        for name in ["", "../x", "a/b", "a\\b", ".hidden", "a b", &"x".repeat(65)] {
            assert!(secrets.set(name, "v").is_err(), "{name:?}");
            assert!(secrets.get(name).is_err(), "{name:?}");
        }
        assert!(valid("thoughtdesk.auth-code-verifier"));
    }
}
