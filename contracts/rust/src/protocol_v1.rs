#![allow(clippy::redundant_closure_call)]
#![allow(clippy::needless_lifetimes)]
#![allow(clippy::match_single_binding)]
#![allow(clippy::clone_on_copy)]

#[doc = r" Error types."]
pub mod error {
    #[doc = r" Error from a `TryFrom` or `FromStr` implementation."]
    pub struct ConversionError(::std::borrow::Cow<'static, str>);
    impl ::std::error::Error for ConversionError {}
    impl ::std::fmt::Display for ConversionError {
        fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> Result<(), ::std::fmt::Error> {
            ::std::fmt::Display::fmt(&self.0, f)
        }
    }
    impl ::std::fmt::Debug for ConversionError {
        fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> Result<(), ::std::fmt::Error> {
            ::std::fmt::Debug::fmt(&self.0, f)
        }
    }
    impl From<&'static str> for ConversionError {
        fn from(value: &'static str) -> Self {
            Self(value.into())
        }
    }
    impl From<String> for ConversionError {
        fn from(value: String) -> Self {
            Self(value.into())
        }
    }
}
#[doc = "`CheckRequest`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"docVersion\","]
#[doc = "    \"id\","]
#[doc = "    \"protocol\","]
#[doc = "    \"settingsVersion\","]
#[doc = "    \"text\","]
#[doc = "    \"type\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"docVersion\": {"]
#[doc = "      \"$ref\": \"#/$defs/version\""]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"minLength\": 1"]
#[doc = "    },"]
#[doc = "    \"protocol\": {"]
#[doc = "      \"$ref\": \"#/$defs/protocol\""]
#[doc = "    },"]
#[doc = "    \"settingsVersion\": {"]
#[doc = "      \"$ref\": \"#/$defs/version\""]
#[doc = "    },"]
#[doc = "    \"text\": {"]
#[doc = "      \"description\": \"Exact editor text; max 100000 UTF-16 code units (TEXT_TOO_LONG otherwise, never truncated).\","]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"type\": {"]
#[doc = "      \"const\": \"check\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct CheckRequest {
    #[serde(rename = "docVersion")]
    pub doc_version: Version,
    pub id: CheckRequestId,
    pub protocol: Protocol,
    #[serde(rename = "settingsVersion")]
    pub settings_version: Version,
    #[doc = "Exact editor text; max 100000 UTF-16 code units (TEXT_TOO_LONG otherwise, never truncated)."]
    pub text: ::std::string::String,
    #[serde(rename = "type")]
    pub type_: ::serde_json::Value,
}
impl ::std::convert::From<&CheckRequest> for CheckRequest {
    fn from(value: &CheckRequest) -> Self {
        value.clone()
    }
}
#[doc = "`CheckRequestId`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"minLength\": 1"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct CheckRequestId(::std::string::String);
impl ::std::ops::Deref for CheckRequestId {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<CheckRequestId> for ::std::string::String {
    fn from(value: CheckRequestId) -> Self {
        value.0
    }
}
impl ::std::convert::From<&CheckRequestId> for CheckRequestId {
    fn from(value: &CheckRequestId) -> Self {
        value.clone()
    }
}
impl ::std::str::FromStr for CheckRequestId {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for CheckRequestId {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for CheckRequestId {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CheckRequestId {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for CheckRequestId {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
#[doc = "`CheckResult`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"docVersion\","]
#[doc = "    \"engineVersion\","]
#[doc = "    \"id\","]
#[doc = "    \"issues\","]
#[doc = "    \"protocol\","]
#[doc = "    \"settingsVersion\","]
#[doc = "    \"status\","]
#[doc = "    \"type\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"analysisMs\": {"]
#[doc = "      \"type\": \"number\","]
#[doc = "      \"minimum\": 0.0"]
#[doc = "    },"]
#[doc = "    \"docVersion\": {"]
#[doc = "      \"$ref\": \"#/$defs/version\""]
#[doc = "    },"]
#[doc = "    \"engineVersion\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"issues\": {"]
#[doc = "      \"type\": \"array\","]
#[doc = "      \"items\": {"]
#[doc = "        \"$ref\": \"#/$defs/Issue\""]
#[doc = "      }"]
#[doc = "    },"]
#[doc = "    \"protocol\": {"]
#[doc = "      \"$ref\": \"#/$defs/protocol\""]
#[doc = "    },"]
#[doc = "    \"settingsVersion\": {"]
#[doc = "      \"$ref\": \"#/$defs/version\""]
#[doc = "    },"]
#[doc = "    \"status\": {"]
#[doc = "      \"description\": \"Incomplete analyses are reported as Error, never as a result.\","]
#[doc = "      \"const\": \"complete\""]
#[doc = "    },"]
#[doc = "    \"type\": {"]
#[doc = "      \"const\": \"result\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct CheckResult {
    #[serde(
        rename = "analysisMs",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub analysis_ms: ::std::option::Option<f64>,
    #[serde(rename = "docVersion")]
    pub doc_version: Version,
    #[serde(rename = "engineVersion")]
    pub engine_version: ::std::string::String,
    pub id: ::std::string::String,
    pub issues: ::std::vec::Vec<Issue>,
    pub protocol: Protocol,
    #[serde(rename = "settingsVersion")]
    pub settings_version: Version,
    #[doc = "Incomplete analyses are reported as Error, never as a result."]
    pub status: ::serde_json::Value,
    #[serde(rename = "type")]
    pub type_: ::serde_json::Value,
}
impl ::std::convert::From<&CheckResult> for CheckResult {
    fn from(value: &CheckResult) -> Self {
        value.clone()
    }
}
#[doc = "Desktop IPC only (engine://status event, engine_status command); not a stdin/stdout message."]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"description\": \"Desktop IPC only (engine://status event, engine_status command); not a stdin/stdout message.\","]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"state\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"state\": {"]
#[doc = "      \"enum\": ["]
#[doc = "        \"starting\","]
#[doc = "        \"ready\","]
#[doc = "        \"busy\","]
#[doc = "        \"restarting\","]
#[doc = "        \"unavailable\""]
#[doc = "      ]"]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct EngineStatus {
    pub state: EngineStatusState,
}
impl ::std::convert::From<&EngineStatus> for EngineStatus {
    fn from(value: &EngineStatus) -> Self {
        value.clone()
    }
}
#[doc = "`EngineStatusState`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"enum\": ["]
#[doc = "    \"starting\","]
#[doc = "    \"ready\","]
#[doc = "    \"busy\","]
#[doc = "    \"restarting\","]
#[doc = "    \"unavailable\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum EngineStatusState {
    #[serde(rename = "starting")]
    Starting,
    #[serde(rename = "ready")]
    Ready,
    #[serde(rename = "busy")]
    Busy,
    #[serde(rename = "restarting")]
    Restarting,
    #[serde(rename = "unavailable")]
    Unavailable,
}
impl ::std::convert::From<&Self> for EngineStatusState {
    fn from(value: &EngineStatusState) -> Self {
        value.clone()
    }
}
impl ::std::fmt::Display for EngineStatusState {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Starting => f.write_str("starting"),
            Self::Ready => f.write_str("ready"),
            Self::Busy => f.write_str("busy"),
            Self::Restarting => f.write_str("restarting"),
            Self::Unavailable => f.write_str("unavailable"),
        }
    }
}
impl ::std::str::FromStr for EngineStatusState {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "starting" => Ok(Self::Starting),
            "ready" => Ok(Self::Ready),
            "busy" => Ok(Self::Busy),
            "restarting" => Ok(Self::Restarting),
            "unavailable" => Ok(Self::Unavailable),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for EngineStatusState {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for EngineStatusState {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for EngineStatusState {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "Desktop IPC only (engine_manifest command, which returns this or null); not a stdin/stdout message. Versions of the bundled engine from engine-manifest.json, without checksums."]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"description\": \"Desktop IPC only (engine_manifest command, which returns this or null); not a stdin/stdout message. Versions of the bundled engine from engine-manifest.json, without checksums.\","]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"adapter\","]
#[doc = "    \"languagetool\","]
#[doc = "    \"runtime\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"adapter\": {"]
#[doc = "      \"description\": \"Adapter version (manifest adapter.version).\","]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"languagetool\": {"]
#[doc = "      \"description\": \"LanguageTool version (manifest languageTool.version).\","]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"runtime\": {"]
#[doc = "      \"description\": \"Java runtime: manifest runtime.vendorVersion, else runtime.version.\","]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct EngineVersions {
    #[doc = "Adapter version (manifest adapter.version)."]
    pub adapter: ::std::string::String,
    #[doc = "LanguageTool version (manifest languageTool.version)."]
    pub languagetool: ::std::string::String,
    #[doc = "Java runtime: manifest runtime.vendorVersion, else runtime.version."]
    pub runtime: ::std::string::String,
}
impl ::std::convert::From<&EngineVersions> for EngineVersions {
    fn from(value: &EngineVersions) -> Self {
        value.clone()
    }
}
#[doc = "An error answering a `check` carries that check's id, docVersion and settingsVersion; receivers drop errors whose versions are not current. Errors not tied to a parseable check (e.g. MALFORMED_REQUEST with id null) omit both."]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"description\": \"An error answering a `check` carries that check's id, docVersion and settingsVersion; receivers drop errors whose versions are not current. Errors not tied to a parseable check (e.g. MALFORMED_REQUEST with id null) omit both.\","]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"code\","]
#[doc = "    \"detail\","]
#[doc = "    \"id\","]
#[doc = "    \"protocol\","]
#[doc = "    \"type\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"code\": {"]
#[doc = "      \"description\": \"Adapter codes: MALFORMED_REQUEST, UNSUPPORTED_PROTOCOL, UNKNOWN_TYPE, TEXT_TOO_LONG, ENGINE_ERROR. Rust-only (supervisor, never emitted by engine-java): TIMEOUT, ENGINE_UNAVAILABLE.\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"MALFORMED_REQUEST\","]
#[doc = "        \"UNSUPPORTED_PROTOCOL\","]
#[doc = "        \"UNKNOWN_TYPE\","]
#[doc = "        \"TEXT_TOO_LONG\","]
#[doc = "        \"ENGINE_ERROR\","]
#[doc = "        \"TIMEOUT\","]
#[doc = "        \"ENGINE_UNAVAILABLE\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"detail\": {"]
#[doc = "      \"description\": \"Never contains user text.\","]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"docVersion\": {"]
#[doc = "      \"$ref\": \"#/$defs/version\""]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"type\": ["]
#[doc = "        \"string\","]
#[doc = "        \"null\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"length\": {"]
#[doc = "      \"type\": \"integer\""]
#[doc = "    },"]
#[doc = "    \"limit\": {"]
#[doc = "      \"type\": \"integer\""]
#[doc = "    },"]
#[doc = "    \"protocol\": {"]
#[doc = "      \"$ref\": \"#/$defs/protocol\""]
#[doc = "    },"]
#[doc = "    \"settingsVersion\": {"]
#[doc = "      \"$ref\": \"#/$defs/version\""]
#[doc = "    },"]
#[doc = "    \"type\": {"]
#[doc = "      \"const\": \"error\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false,"]
#[doc = "  \"dependentRequired\": {"]
#[doc = "    \"docVersion\": ["]
#[doc = "      \"settingsVersion\""]
#[doc = "    ],"]
#[doc = "    \"settingsVersion\": ["]
#[doc = "      \"docVersion\""]
#[doc = "    ]"]
#[doc = "  }"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ErrorMessage {
    #[doc = "Adapter codes: MALFORMED_REQUEST, UNSUPPORTED_PROTOCOL, UNKNOWN_TYPE, TEXT_TOO_LONG, ENGINE_ERROR. Rust-only (supervisor, never emitted by engine-java): TIMEOUT, ENGINE_UNAVAILABLE."]
    pub code: ErrorMessageCode,
    #[doc = "Never contains user text."]
    pub detail: ::std::string::String,
    #[serde(
        rename = "docVersion",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub doc_version: ::std::option::Option<Version>,
    pub id: ::std::option::Option<::std::string::String>,
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub length: ::std::option::Option<i64>,
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub limit: ::std::option::Option<i64>,
    pub protocol: Protocol,
    #[serde(
        rename = "settingsVersion",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub settings_version: ::std::option::Option<Version>,
    #[serde(rename = "type")]
    pub type_: ::serde_json::Value,
}
impl ::std::convert::From<&ErrorMessage> for ErrorMessage {
    fn from(value: &ErrorMessage) -> Self {
        value.clone()
    }
}
#[doc = "Adapter codes: MALFORMED_REQUEST, UNSUPPORTED_PROTOCOL, UNKNOWN_TYPE, TEXT_TOO_LONG, ENGINE_ERROR. Rust-only (supervisor, never emitted by engine-java): TIMEOUT, ENGINE_UNAVAILABLE."]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"description\": \"Adapter codes: MALFORMED_REQUEST, UNSUPPORTED_PROTOCOL, UNKNOWN_TYPE, TEXT_TOO_LONG, ENGINE_ERROR. Rust-only (supervisor, never emitted by engine-java): TIMEOUT, ENGINE_UNAVAILABLE.\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"MALFORMED_REQUEST\","]
#[doc = "    \"UNSUPPORTED_PROTOCOL\","]
#[doc = "    \"UNKNOWN_TYPE\","]
#[doc = "    \"TEXT_TOO_LONG\","]
#[doc = "    \"ENGINE_ERROR\","]
#[doc = "    \"TIMEOUT\","]
#[doc = "    \"ENGINE_UNAVAILABLE\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ErrorMessageCode {
    #[serde(rename = "MALFORMED_REQUEST")]
    MalformedRequest,
    #[serde(rename = "UNSUPPORTED_PROTOCOL")]
    UnsupportedProtocol,
    #[serde(rename = "UNKNOWN_TYPE")]
    UnknownType,
    #[serde(rename = "TEXT_TOO_LONG")]
    TextTooLong,
    #[serde(rename = "ENGINE_ERROR")]
    EngineError,
    #[serde(rename = "TIMEOUT")]
    Timeout,
    #[serde(rename = "ENGINE_UNAVAILABLE")]
    EngineUnavailable,
}
impl ::std::convert::From<&Self> for ErrorMessageCode {
    fn from(value: &ErrorMessageCode) -> Self {
        value.clone()
    }
}
impl ::std::fmt::Display for ErrorMessageCode {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::MalformedRequest => f.write_str("MALFORMED_REQUEST"),
            Self::UnsupportedProtocol => f.write_str("UNSUPPORTED_PROTOCOL"),
            Self::UnknownType => f.write_str("UNKNOWN_TYPE"),
            Self::TextTooLong => f.write_str("TEXT_TOO_LONG"),
            Self::EngineError => f.write_str("ENGINE_ERROR"),
            Self::Timeout => f.write_str("TIMEOUT"),
            Self::EngineUnavailable => f.write_str("ENGINE_UNAVAILABLE"),
        }
    }
}
impl ::std::str::FromStr for ErrorMessageCode {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "MALFORMED_REQUEST" => Ok(Self::MalformedRequest),
            "UNSUPPORTED_PROTOCOL" => Ok(Self::UnsupportedProtocol),
            "UNKNOWN_TYPE" => Ok(Self::UnknownType),
            "TEXT_TOO_LONG" => Ok(Self::TextTooLong),
            "ENGINE_ERROR" => Ok(Self::EngineError),
            "TIMEOUT" => Ok(Self::Timeout),
            "ENGINE_UNAVAILABLE" => Ok(Self::EngineUnavailable),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ErrorMessageCode {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ErrorMessageCode {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ErrorMessageCode {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`Issue`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"category\","]
#[doc = "    \"end\","]
#[doc = "    \"engineCategory\","]
#[doc = "    \"issueType\","]
#[doc = "    \"message\","]
#[doc = "    \"replacements\","]
#[doc = "    \"ruleId\","]
#[doc = "    \"start\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"category\": {"]
#[doc = "      \"enum\": ["]
#[doc = "        \"spelling\","]
#[doc = "        \"punctuation\","]
#[doc = "        \"grammar\","]
#[doc = "        \"style\","]
#[doc = "        \"other\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"end\": {"]
#[doc = "      \"description\": \"Exclusive; end == start is an insertion point.\","]
#[doc = "      \"type\": \"integer\","]
#[doc = "      \"minimum\": 0.0"]
#[doc = "    },"]
#[doc = "    \"engineCategory\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"issueType\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"message\": {"]
#[doc = "      \"description\": \"Plain text (adapter strips LanguageTool markup such as <suggestion>). UI never renders it as HTML.\","]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"replacements\": {"]
#[doc = "      \"description\": \"Empty = warning without a ready fix.\","]
#[doc = "      \"type\": \"array\","]
#[doc = "      \"items\": {"]
#[doc = "        \"type\": \"string\""]
#[doc = "      }"]
#[doc = "    },"]
#[doc = "    \"ruleId\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"start\": {"]
#[doc = "      \"type\": \"integer\","]
#[doc = "      \"minimum\": 0.0"]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct Issue {
    pub category: IssueCategory,
    #[doc = "Exclusive; end == start is an insertion point."]
    pub end: u64,
    #[serde(rename = "engineCategory")]
    pub engine_category: ::std::string::String,
    #[serde(rename = "issueType")]
    pub issue_type: ::std::string::String,
    #[doc = "Plain text (adapter strips LanguageTool markup such as <suggestion>). UI never renders it as HTML."]
    pub message: ::std::string::String,
    #[doc = "Empty = warning without a ready fix."]
    pub replacements: ::std::vec::Vec<::std::string::String>,
    #[serde(rename = "ruleId")]
    pub rule_id: ::std::string::String,
    pub start: u64,
}
impl ::std::convert::From<&Issue> for Issue {
    fn from(value: &Issue) -> Self {
        value.clone()
    }
}
#[doc = "`IssueCategory`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"enum\": ["]
#[doc = "    \"spelling\","]
#[doc = "    \"punctuation\","]
#[doc = "    \"grammar\","]
#[doc = "    \"style\","]
#[doc = "    \"other\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum IssueCategory {
    #[serde(rename = "spelling")]
    Spelling,
    #[serde(rename = "punctuation")]
    Punctuation,
    #[serde(rename = "grammar")]
    Grammar,
    #[serde(rename = "style")]
    Style,
    #[serde(rename = "other")]
    Other,
}
impl ::std::convert::From<&Self> for IssueCategory {
    fn from(value: &IssueCategory) -> Self {
        value.clone()
    }
}
impl ::std::fmt::Display for IssueCategory {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Spelling => f.write_str("spelling"),
            Self::Punctuation => f.write_str("punctuation"),
            Self::Grammar => f.write_str("grammar"),
            Self::Style => f.write_str("style"),
            Self::Other => f.write_str("other"),
        }
    }
}
impl ::std::str::FromStr for IssueCategory {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "spelling" => Ok(Self::Spelling),
            "punctuation" => Ok(Self::Punctuation),
            "grammar" => Ok(Self::Grammar),
            "style" => Ok(Self::Style),
            "other" => Ok(Self::Other),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for IssueCategory {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for IssueCategory {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for IssueCategory {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "JSON lines over stdin/stdout between Rust and engine-java (protocol 1). Rust forwards these messages unchanged over Tauri IPC to the UI. Ranges are UTF-16 code units, end exclusive; start == end is an insertion point. Unknown fields are rejected."]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"$id\": \"https://ortografi-check.local/contracts/v1/protocol.schema.json\","]
#[doc = "  \"title\": \"ortografi engine protocol v1\","]
#[doc = "  \"description\": \"JSON lines over stdin/stdout between Rust and engine-java (protocol 1). Rust forwards these messages unchanged over Tauri IPC to the UI. Ranges are UTF-16 code units, end exclusive; start == end is an insertion point. Unknown fields are rejected.\","]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/Ready\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/CheckRequest\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/CheckResult\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ErrorMessage\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/Shutdown\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(untagged)]
pub enum OrtografiEngineProtocolV1 {
    Ready(Ready),
    CheckRequest(CheckRequest),
    CheckResult(CheckResult),
    ErrorMessage(ErrorMessage),
    Shutdown(Shutdown),
}
impl ::std::convert::From<&Self> for OrtografiEngineProtocolV1 {
    fn from(value: &OrtografiEngineProtocolV1) -> Self {
        value.clone()
    }
}
impl ::std::convert::From<Ready> for OrtografiEngineProtocolV1 {
    fn from(value: Ready) -> Self {
        Self::Ready(value)
    }
}
impl ::std::convert::From<CheckRequest> for OrtografiEngineProtocolV1 {
    fn from(value: CheckRequest) -> Self {
        Self::CheckRequest(value)
    }
}
impl ::std::convert::From<CheckResult> for OrtografiEngineProtocolV1 {
    fn from(value: CheckResult) -> Self {
        Self::CheckResult(value)
    }
}
impl ::std::convert::From<ErrorMessage> for OrtografiEngineProtocolV1 {
    fn from(value: ErrorMessage) -> Self {
        Self::ErrorMessage(value)
    }
}
impl ::std::convert::From<Shutdown> for OrtografiEngineProtocolV1 {
    fn from(value: Shutdown) -> Self {
        Self::Shutdown(value)
    }
}
#[doc = "`Protocol`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"const\": 1"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct Protocol(pub ::serde_json::Value);
impl ::std::ops::Deref for Protocol {
    type Target = ::serde_json::Value;
    fn deref(&self) -> &::serde_json::Value {
        &self.0
    }
}
impl ::std::convert::From<Protocol> for ::serde_json::Value {
    fn from(value: Protocol) -> Self {
        value.0
    }
}
impl ::std::convert::From<&Protocol> for Protocol {
    fn from(value: &Protocol) -> Self {
        value.clone()
    }
}
impl ::std::convert::From<::serde_json::Value> for Protocol {
    fn from(value: ::serde_json::Value) -> Self {
        Self(value)
    }
}
#[doc = "`Ready`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"engineVersion\","]
#[doc = "    \"language\","]
#[doc = "    \"protocol\","]
#[doc = "    \"type\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"engineVersion\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"language\": {"]
#[doc = "      \"const\": \"pl-PL\""]
#[doc = "    },"]
#[doc = "    \"protocol\": {"]
#[doc = "      \"$ref\": \"#/$defs/protocol\""]
#[doc = "    },"]
#[doc = "    \"type\": {"]
#[doc = "      \"const\": \"ready\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct Ready {
    #[serde(rename = "engineVersion")]
    pub engine_version: ::std::string::String,
    pub language: ::serde_json::Value,
    pub protocol: Protocol,
    #[serde(rename = "type")]
    pub type_: ::serde_json::Value,
}
impl ::std::convert::From<&Ready> for Ready {
    fn from(value: &Ready) -> Self {
        value.clone()
    }
}
#[doc = "`Shutdown`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"protocol\","]
#[doc = "    \"type\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"protocol\": {"]
#[doc = "      \"$ref\": \"#/$defs/protocol\""]
#[doc = "    },"]
#[doc = "    \"type\": {"]
#[doc = "      \"const\": \"shutdown\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct Shutdown {
    pub protocol: Protocol,
    #[serde(rename = "type")]
    pub type_: ::serde_json::Value,
}
impl ::std::convert::From<&Shutdown> for Shutdown {
    fn from(value: &Shutdown) -> Self {
        value.clone()
    }
}
#[doc = "`Version`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"integer\","]
#[doc = "  \"minimum\": 0.0"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct Version(pub u64);
impl ::std::ops::Deref for Version {
    type Target = u64;
    fn deref(&self) -> &u64 {
        &self.0
    }
}
impl ::std::convert::From<Version> for u64 {
    fn from(value: Version) -> Self {
        value.0
    }
}
impl ::std::convert::From<&Version> for Version {
    fn from(value: &Version) -> Self {
        value.clone()
    }
}
impl ::std::convert::From<u64> for Version {
    fn from(value: u64) -> Self {
        Self(value)
    }
}
impl ::std::str::FromStr for Version {
    type Err = <u64 as ::std::str::FromStr>::Err;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.parse()?))
    }
}
impl ::std::convert::TryFrom<&str> for Version {
    type Error = <u64 as ::std::str::FromStr>::Err;
    fn try_from(value: &str) -> ::std::result::Result<Self, Self::Error> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&String> for Version {
    type Error = <u64 as ::std::str::FromStr>::Err;
    fn try_from(value: &String) -> ::std::result::Result<Self, Self::Error> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<String> for Version {
    type Error = <u64 as ::std::str::FromStr>::Err;
    fn try_from(value: String) -> ::std::result::Result<Self, Self::Error> {
        value.parse()
    }
}
impl ::std::fmt::Display for Version {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
