use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanPackFile {
    #[serde(rename = "schemaVersion")]
    pub schema_version: u32,
    pub generated_at: Option<String>,
    pub generator: Option<String>,
    pub machine_hint: Option<String>,
    #[serde(default)]
    pub profile: CleanPackProfile,
    pub pack: CleanPackBody,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanPackProfile {
    #[serde(default)]
    pub enabled_built_in_ids: Vec<String>,
    #[serde(default)]
    pub disabled_built_in_ids: Vec<String>,
    pub browser_clear_cookies: Option<bool>,
    #[serde(default)]
    pub extra_roots: Vec<String>,
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanPackBody {
    #[serde(default)]
    pub items: Vec<PackItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackItem {
    pub id: String,
    pub label: String,
    pub paths: Vec<String>,
    pub purpose: String,
    pub delete_note: String,
    #[serde(default = "default_pack_tag")]
    pub tag: String,
    #[serde(default)]
    pub warn: bool,
    #[serde(default)]
    pub default_checked: bool,
}

fn default_pack_tag() -> String {
    "可安全清理".into()
}
