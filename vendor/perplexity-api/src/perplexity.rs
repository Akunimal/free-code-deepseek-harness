
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use uuid::Uuid;

const PERPLEXITY_ENDPOINT: &str = "https://www.perplexity.ai/rest/sse/perplexity_ask";
const UPLOAD_URLS_ENDPOINT: &str = "https://www.perplexity.ai/rest/uploads/batch_create_upload_urls?version=2.18&source=default";
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerplexityResponse {
    pub answer: String,
    pub sources: Vec<Source>,
    pub related_queries: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_events: Option<Vec<SseEvent>>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Source {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snippet: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SseEvent {
    pub request_id: String,
    pub event: String,
    pub data: Value,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Attachment {
    pub url: String,
    pub content_type: String,
    pub filename: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadUrlResponse {
    pub results: HashMap<String, UploadUrlResult>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadUrlResult {
    pub s3_bucket_url: String,
    pub s3_object_url: String,
    pub fields: HashMap<String, String>,
    pub rate_limited: bool,
    pub file_uuid: String,
    pub error: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileUploadRequest {
    pub filename: String,
    pub content_type: String,
    pub file_size: u64,
    #[serde(default = "default_source")]
    pub source: String,
    #[serde(default)]
    pub force_image: bool,
    #[serde(default = "default_search_mode")]
    pub search_mode: String,
}
fn default_source() -> String {
    "default".to_string()
}
fn default_search_mode() -> String {
    "search".to_string()
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadedFile {
    pub s3_url: String,
    pub file_uuid: String,
    pub filename: String,
    pub content_type: String,
}
pub struct PerplexityClient {
    endpoint: String,
    request_timeout_secs: u64,
    curl_wrapper: PathBuf,
    cookie: Option<String>,
}

impl Default for PerplexityClient {
    fn default() -> Self {
        Self::new()
    }
}

impl PerplexityClient {
    pub fn new() -> Self {
        let curl_wrapper = Self::find_curl_impersonate();

        let cookie = std::env::var("PERPLEXITY_COOKIE").ok().filter(|c| !c.is_empty());
        if cookie.is_some() {
            tracing::info!("🍪 Perplexity cookie loaded — authenticated mode");
        } else {
            tracing::warn!("⚠️  No PERPLEXITY_COOKIE set — running in anonymous mode (limited)");
        }

        Self {
            endpoint: PERPLEXITY_ENDPOINT.to_string(),
            request_timeout_secs: 120,
            curl_wrapper,
            cookie,
        }
    }
    fn add_cookie_args(&self, cmd: &mut Command) {
        if let Some(ref cookie) = self.cookie {
            cmd.args(["-H", &format!("Cookie: {}", cookie)]);
        }
    }
    fn find_curl_impersonate() -> PathBuf {

        if let Ok(path) = std::env::var("CURL_IMPERSONATE_PATH") {
            return PathBuf::from(path);
        }

        let candidates = [
            PathBuf::from("./curl/curl_chrome116"),
            PathBuf::from("./bin/curl_chrome116"),
            PathBuf::from("/usr/local/bin/curl_chrome116"),
            PathBuf::from("/usr/bin/curl_chrome116"),
            dirs_next::home_dir()
                .map(|h| h.join(".local/bin/curl_chrome116"))
                .unwrap_or_default(),
        ];

        for candidate in candidates {
            if candidate.exists() {
                tracing::info!("Found curl-impersonate at: {:?}", candidate);
                return candidate;
            }
        }
        tracing::warn!("curl-impersonate not found, using default path");
        PathBuf::from("./bin/curl_chrome116")
    }

    fn build_payload(&self, query: &str, model: &str, attachments: &[Attachment]) -> Value {
        let attachment_urls: Vec<Value> = attachments
            .iter()
            .map(|a| Value::String(a.url.clone()))
            .collect();

        json!({
            "params": {
                "attachments": attachment_urls,
                "language": "en-US",
                "timezone": "America/New_York",
                "search_focus": "internet",
                "sources": ["web"],
                "frontend_uuid": Uuid::new_v4().to_string(),
                "mode": "copilot",
                "model_preference": model,
                "is_related_query": false,
                "is_sponsored": false,
                "prompt_source": "user",
                "query_source": "home",
                "is_incognito": false,
                "local_search_enabled": false,
                "use_schematized_api": true,
                "send_back_text_in_streaming_api": false,
                "supported_block_use_cases": [
                    "answer_modes",
                    "media_items",
                    "knowledge_cards",
                    "inline_entity_cards",
                    "place_widgets",
                    "finance_widgets",
                    "prediction_market_widgets",
                    "sports_widgets",
                    "flight_status_widgets",
                    "news_widgets",
                    "shopping_widgets",
                    "jobs_widgets",
                    "search_result_widgets",
                    "inline_images",
                    "inline_assets",
                    "placeholder_cards",
                    "diff_blocks",
                    "inline_knowledge_cards",
                    "entity_group_v2",
                    "refinement_filters",
                    "canvas_mode",
                    "maps_preview",
                    "answer_tabs",
                    "price_comparison_widgets",
                    "preserve_latex",
                    "generic_onboarding_widgets",
                    "in_context_suggestions",
                    "pending_followups",
                    "inline_claims"
                ],
                "client_coordinates": null,
                "mentions": [],
                "skip_search_enabled": true,
                "is_nav_suggestions_disabled": false,
                "always_search_override": false,
                "override_no_search": false,
                "should_ask_for_mcp_tool_confirmation": true,
                "force_enable_browser_agent": false,
                "supported_features": ["browser_agent_permission_banner_v1.1"],
                "version": "2.18"
            },
            "query_str": query
        })
    }

    pub async fn create_upload_urls(
        &self,
        files: &[FileUploadRequest],
    ) -> Result<UploadUrlResponse> {

        let mut files_map = serde_json::Map::new();
        for file in files {
            let file_uuid = Uuid::new_v4().to_string();
            files_map.insert(
                file_uuid,
                json!({
                    "filename": file.filename,
                    "content_type": file.content_type,
                    "source": file.source,
                    "file_size": file.file_size,
                    "force_image": file.force_image,
                    "search_mode": file.search_mode
                }),
            );
        }

        let payload = json!({ "files": files_map });
        let payload_str = serde_json::to_string(&payload)?;

        let request_id = Uuid::new_v4().to_string();
        let temp_file = std::env::temp_dir().join(format!("pplx_upload_urls_{}.json", request_id));
        {
            let mut file = std::fs::File::create(&temp_file)?;
            file.write_all(payload_str.as_bytes())?;
        }

        tracing::info!("Requesting upload URLs for {} files", files.len());
        let mut cmd = Command::new(&self.curl_wrapper);
        cmd.args([
            "-s",
            "--max-time",
            "30",
            "-H",
            "Accept: */*",
            "-H",
            "Content-Type: application/json",
            "-H",
            "Origin: https://www.perplexity.ai",
            "-H",
            "Referer: https://www.perplexity.ai/",
            "-H",
            "x-app-apiclient: default",
            "-H",
            "x-app-apiversion: 2.18",
            "-H",
            &format!("x-perplexity-request-endpoint: {}", UPLOAD_URLS_ENDPOINT),
            "-H",
            "x-perplexity-request-reason: ask-input-inner-home",
            "-H",
            "x-perplexity-request-try-number: 1",
            "-X",
            "POST",
            "-d",
            &format!("@{}", temp_file.display()),
            UPLOAD_URLS_ENDPOINT,
        ]);
        self.add_cookie_args(&mut cmd);

        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| {
            anyhow!("Failed to spawn curl-impersonate for upload URLs: {}", e)
        })?;

        let stdout = child.stdout.take().unwrap();
        let mut stdout_reader = BufReader::new(stdout);
        let mut response = String::new();
        let mut line = String::new();
        while stdout_reader.read_line(&mut line).await? > 0 {
            response.push_str(&line);
            line.clear();
        }

        let status = child.wait().await?;
        let _ = std::fs::remove_file(&temp_file);

        if !status.success() {
            return Err(anyhow!(
                "curl-impersonate failed for upload URLs (exit code: {:?})",
                status.code()
            ));
        }

        if response.is_empty() {
            return Err(anyhow!("Empty response from batch_create_upload_urls"));
        }

        tracing::debug!("Upload URLs response: {}", &response);

        let upload_response: UploadUrlResponse = serde_json::from_str(&response)
            .map_err(|e| anyhow!("Failed to parse upload URL response: {} — raw: {}", e, &response))?;

        tracing::info!(
            "Got upload URLs for {} files",
            upload_response.results.len()
        );

        Ok(upload_response)
    }

    pub async fn upload_file_to_s3(
        &self,
        file_path: &Path,
        upload_result: &UploadUrlResult,
    ) -> Result<String> {
        let s3_bucket_url = &upload_result.s3_bucket_url;

        tracing::info!(
            "Uploading file {:?} to S3 bucket: {}",
            file_path,
            s3_bucket_url
        );
        let file_bytes = tokio::fs::read(file_path).await
            .map_err(|e| anyhow!("Failed to read file {:?}: {}", file_path, e))?;

        let filename = file_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("upload")
            .to_string();

        let content_type = upload_result
            .fields
            .get("Content-Type")
            .cloned()
            .unwrap_or_else(|| "application/octet-stream".to_string());
        let mut form = reqwest::multipart::Form::new();
        let field_order = [
            "acl",
            "Content-Type",
            "tagging",
            "x-amz-meta-is_text_only",
            "key",
            "AWSAccessKeyId",
            "x-amz-security-token",
            "policy",
            "signature",
        ];

        for field_name in &field_order {
            if let Some(value) = upload_result.fields.get(*field_name) {
                form = form.text(field_name.to_string(), value.clone());
            }
        }
        for (key, value) in &upload_result.fields {
            if !field_order.contains(&key.as_str()) {
                form = form.text(key.clone(), value.clone());
            }
        }
        let file_part = reqwest::multipart::Part::bytes(file_bytes)
            .file_name(filename)
            .mime_str(&content_type)
            .map_err(|e| anyhow!("Invalid content type '{}': {}", content_type, e))?;
        form = form.part("file", file_part);
        let client = reqwest::Client::new();
        let resp = client
            .post(s3_bucket_url)
            .header("Origin", "https://www.perplexity.ai")
            .header("Referer", "https://www.perplexity.ai/")
            .multipart(form)
            .send()
            .await
            .map_err(|e| anyhow!("S3 upload request failed: {}", e))?;

        let status = resp.status();
        if !status.is_success() && status.as_u16() != 204 {
            let body = resp.text().await.unwrap_or_default();
            return Err(anyhow!(
                "S3 upload failed with status {}: {}",
                status,
                body
            ));
        }

        let s3_url = upload_result.s3_object_url.clone();

        tracing::info!("File uploaded successfully to: {}", s3_url);

        Ok(s3_url)
    }

    pub async fn upload_files(
        &self,
        file_paths: &[PathBuf],
    ) -> Result<Vec<UploadedFile>> {
        if file_paths.is_empty() {
            return Ok(Vec::new());
        }
        let file_requests: Vec<FileUploadRequest> = file_paths
            .iter()
            .map(|path| {
                let filename = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown")
                    .to_string();
                let content_type = guess_content_type(&filename);
                let file_size = std::fs::metadata(path)
                    .map(|m| m.len())
                    .unwrap_or(0);

                FileUploadRequest {
                    filename,
                    content_type,
                    file_size,
                    source: "default".to_string(),
                    force_image: false,
                    search_mode: "search".to_string(),
                }
            })
            .collect();
        let url_response = self.create_upload_urls(&file_requests).await?;
        let mut uploaded_files = Vec::new();
        let result_entries: Vec<_> = url_response.results.into_iter().collect();

        for (i, (request_uuid, upload_result)) in result_entries.into_iter().enumerate() {
            if let Some(error) = &upload_result.error {
                tracing::error!(
                    "Upload URL error for {}: {}",
                    request_uuid,
                    error
                );
                continue;
            }

            if upload_result.rate_limited {
                tracing::warn!("Upload rate limited for {}", request_uuid);
                continue;
            }
            let file_path = if i < file_paths.len() {
                &file_paths[i]
            } else {
                tracing::warn!("No corresponding file path for upload result {}", i);
                continue;
            };
            let s3_url = self.upload_file_to_s3(file_path, &upload_result).await?;

            let filename = file_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();

            let content_type = upload_result
                .fields
                .get("Content-Type")
                .cloned()
                .unwrap_or_else(|| guess_content_type(&filename));

            uploaded_files.push(UploadedFile {
                s3_url,
                file_uuid: upload_result.file_uuid,
                filename,
                content_type,
            });
        }

        tracing::info!("Successfully uploaded {} files", uploaded_files.len());
        Ok(uploaded_files)
    }

    async fn execute_curl(&self, payload: &Value, request_id: &str) -> Result<String> {
        let payload_str = serde_json::to_string(payload)?;
        let temp_file = std::env::temp_dir().join(format!("perplexity_{}.json", request_id));
        {
            let mut file = std::fs::File::create(&temp_file)?;
            file.write_all(payload_str.as_bytes())?;
        }

        tracing::debug!("Payload written to: {:?}", temp_file);
        let mut cmd = Command::new(&self.curl_wrapper);
        cmd.args([
            "-s",
            "-N",
            "--max-time",
            &self.request_timeout_secs.to_string(),
            "-H",
            "Accept: text/event-stream",
            "-H",
            "Content-Type: application/json",
            "-H",
            "Origin: https://www.perplexity.ai",
            "-H",
            "Referer: https://www.perplexity.ai/",
            "-H",
            &format!("X-Request-ID: {}", request_id),
            "-H",
            "X-Perplexity-Request-Reason: perplexity-query-state-provider",
            "-X",
            "POST",
            "-d",
            &format!("@{}", temp_file.display()),
            &self.endpoint,
        ]);
        self.add_cookie_args(&mut cmd);

        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        tracing::debug!("Executing curl-impersonate");

        let mut child = cmd.spawn().map_err(|e| {
            anyhow!(
                "Failed to spawn curl-impersonate at {:?}: {}. \
                Please ensure curl-impersonate is installed or set CURL_IMPERSONATE_PATH.",
                self.curl_wrapper,
                e
            )
        })?;

        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();
        let mut stdout_reader = BufReader::new(stdout);
        let mut response = String::new();
        let mut line = String::new();

        while stdout_reader.read_line(&mut line).await? > 0 {
            response.push_str(&line);
            line.clear();
        }
        let mut stderr_reader = BufReader::new(stderr);
        let mut stderr_output = String::new();
        let mut err_line = String::new();
        while stderr_reader.read_line(&mut err_line).await? > 0 {
            stderr_output.push_str(&err_line);
            err_line.clear();
        }

        let status = child.wait().await?;
        let _ = std::fs::remove_file(&temp_file);

        let exit_code = status.code().unwrap_or(-1);

        tracing::info!(
            "curl exited with code {}, response: {} bytes",
            exit_code,
            response.len()
        );
        if exit_code != 0 {
            if exit_code == 18 && !response.is_empty() {
                tracing::warn!(
                    "curl exited with code 18 (partial file) but received {} bytes, attempting to use data",
                    response.len()
                );
            } else {
                return Err(anyhow!(
                    "curl-impersonate exited with code {}: {}",
                    exit_code,
                    stderr_output
                ));
            }
        }
        if response.contains("Just a moment") || response.contains("cf-browser-verification") {
            return Err(anyhow!("Blocked by Cloudflare challenge"));
        }

        if response.is_empty() {
            return Err(anyhow!("Empty response from Perplexity"));
        }
        if response.contains("<!DOCTYPE") || response.contains("<html") {
            if response.contains("403") || response.contains("Forbidden") {
                return Err(anyhow!("HTTP 403 Forbidden from Perplexity"));
            }
            if response.contains("429") {
                return Err(anyhow!("HTTP 429 Rate Limited from Perplexity"));
            }
            return Err(anyhow!("Unexpected HTML response from Perplexity"));
        }

        Ok(response)
    }
    fn parse_sse(&self, raw_response: &str, request_id: &str) -> Vec<SseEvent> {
        let mut events = Vec::new();
        let mut event_name: Option<String> = None;

        for line in raw_response.lines() {
            let line = line.trim();

            if line.is_empty() || line.starts_with(':') {
                continue;
            }

            if let Some(name) = line.strip_prefix("event:") {
                event_name = Some(name.trim().to_string());
                continue;
            }

            if let Some(data_str) = line.strip_prefix("data:") {
                let data_str = data_str.trim();
                if data_str.is_empty() {
                    continue;
                }

                let data: Value = serde_json::from_str(data_str).unwrap_or(Value::String(data_str.to_string()));

                events.push(SseEvent {
                    request_id: request_id.to_string(),
                    event: event_name.clone().unwrap_or_else(|| "message".to_string()),
                    data,
                });
            }
        }

        tracing::info!("Parsed {} events from SSE", events.len());
        events
    }
    fn extract_answer(&self, events: &[SseEvent]) -> PerplexityResponse {
        let mut answer = String::new();
        let mut sources = Vec::new();
        let mut related_queries = Vec::new();

        for event in events {
            let data = &event.data;

            if !data.is_object() {
                continue;
            }
            if data.get("text_completed") == Some(&Value::Bool(true)) {
                if let Some(blocks) = data.get("blocks").and_then(|b| b.as_array()) {
                    tracing::info!("Found completed message with {} blocks", blocks.len());

                    for block in blocks {
                        let is_ask_text = block
                            .get("intended_usage")
                            .and_then(|u| u.as_str())
                            .map(|u| u == "ask_text" || u.starts_with("ask_text_"))
                            .unwrap_or(false);

                        if is_ask_text {
                            if let Some(markdown_block) = block.get("markdown_block") {
                                if let Some(ans) = markdown_block.get("answer").and_then(|a| a.as_str()) {
                                    if answer.is_empty() {
                                        answer = ans.to_string();
                                        tracing::info!("Found answer: {}...", &answer.chars().take(100).collect::<String>());
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if let Some(widget_data) = data.get("widget_data").and_then(|w| w.as_array()) {
                for widget in widget_data {
                    let url = widget.get("url").and_then(|u| u.as_str());
                    if let Some(url_str) = url {
                        if url_str != "https://perplexity.ai" {
                            sources.push(Source {
                                name: widget.get("name").and_then(|n| n.as_str()).map(String::from),
                                url: Some(url_str.to_string()),
                                snippet: widget.get("snippet").and_then(|s| s.as_str()).map(String::from),
                            });
                        }
                    }
                }
            }
            if let Some(queries) = data.get("related_queries").and_then(|q| q.as_array()) {
                for query in queries {
                    if let Some(q_str) = query.as_str() {
                        related_queries.push(q_str.to_string());
                    }
                }
            }
        }

        tracing::info!(
            "Extraction complete: answer={} chars, sources={}, related={}",
            answer.len(),
            sources.len(),
            related_queries.len()
        );

        PerplexityResponse {
            answer: if answer.is_empty() {
                "Sorry, I could not generate a response. Please try again.".to_string()
            } else {
                answer
            },
            sources,
            related_queries,
            raw_events: None,
        }
    }

    pub async fn ask_with_attachments(
        &self,
        query: &str,
        model: &str,
        attachments: &[Attachment],
    ) -> Result<Vec<SseEvent>> {
        if query.is_empty() {
            return Err(anyhow!("query must be a non-empty string"));
        }

        let payload = self.build_payload(query, model, attachments);
        let request_id = Uuid::new_v4().to_string();

        tracing::info!(
            "Starting request: query='{}...', model={}, attachments={}, request_id={}",
            query.chars().take(50).collect::<String>(),
            model,
            attachments.len(),
            request_id
        );

        let raw_response = self.execute_curl(&payload, &request_id).await?;
        Ok(self.parse_sse(&raw_response, &request_id))
    }

    pub async fn get_answer_with_attachments(
        &self,
        query: &str,
        model: &str,
        attachments: &[Attachment],
    ) -> Result<PerplexityResponse> {
        tracing::info!(
            "get_answer called: query='{}...', model={}, attachments={}",
            query.chars().take(50).collect::<String>(),
            model,
            attachments.len()
        );

        let events = self.ask_with_attachments(query, model, attachments).await?;
        tracing::info!("Received {} events", events.len());

        let mut response = self.extract_answer(&events);
        response.raw_events = Some(events);

        Ok(response)
    }

    pub async fn stream_answer(
        &self,
        query: &str,
        model: &str,
        attachments: &[Attachment],
    ) -> Result<tokio::sync::mpsc::Receiver<String>> {
        if query.is_empty() {
            return Err(anyhow!("query must be a non-empty string"));
        }

        let payload = self.build_payload(query, model, attachments);
        let request_id = Uuid::new_v4().to_string();
        let payload_str = serde_json::to_string(&payload)?;
        let temp_file = std::env::temp_dir().join(format!("perplexity_{}.json", &request_id));
        {
            let mut file = std::fs::File::create(&temp_file)?;
            file.write_all(payload_str.as_bytes())?;
        }

        tracing::info!(
            "Starting streaming request: query='{}...', model={}, request_id={}",
            query.chars().take(50).collect::<String>(),
            model,
            &request_id
        );

        let mut cmd = Command::new(&self.curl_wrapper);
        cmd.args([
            "-s",
            "-N",
            "--max-time",
            &self.request_timeout_secs.to_string(),
            "-H", "Accept: text/event-stream",
            "-H", "Content-Type: application/json",
            "-H", "Origin: https://www.perplexity.ai",
            "-H", "Referer: https://www.perplexity.ai/",
            "-H", &format!("X-Request-ID: {}", &request_id),
            "-H", "X-Perplexity-Request-Reason: perplexity-query-state-provider",
            "-X", "POST",
            "-d", &format!("@{}", temp_file.display()),
            &self.endpoint,
        ]);
        self.add_cookie_args(&mut cmd);

        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| {
            anyhow!("Failed to spawn curl-impersonate: {}", e)
        })?;

        let stdout = child.stdout.take().unwrap();

        let (tx, rx) = tokio::sync::mpsc::channel::<String>(64);

        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout);
            let mut line = String::new();
            let mut previous_answer = String::new();

            while let Ok(bytes_read) = reader.read_line(&mut line).await {
                if bytes_read == 0 {
                    break;
                }

                let trimmed = line.trim();
                if let Some(data_str) = trimmed.strip_prefix("data:") {
                    let data_str = data_str.trim();
                    if !data_str.is_empty() {
                        if let Ok(data) = serde_json::from_str::<Value>(data_str) {

                            if let Some(blocks) = data.get("blocks").and_then(|b| b.as_array()) {
                                for block in blocks {
                                    let is_ask_text = block
                                        .get("intended_usage")
                                        .and_then(|u| u.as_str())
                                        .map(|u| u == "ask_text" || u.starts_with("ask_text_"))
                                        .unwrap_or(false);

                                    if is_ask_text {
                                        if let Some(ans) = block
                                            .get("markdown_block")
                                            .and_then(|mb| mb.get("answer"))
                                            .and_then(|a| a.as_str())
                                        {

                                            if ans.len() > previous_answer.len() {
                                                let delta = &ans[previous_answer.len()..];
                                                if !delta.is_empty() {
                                                    if tx.send(delta.to_string()).await.is_err() {

                                                        break;
                                                    }
                                                }
                                                previous_answer = ans.to_string();
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                line.clear();
            }
            let _ = child.wait().await;
            let _ = std::fs::remove_file(&temp_file);

            tracing::info!("Streaming complete, sent {} chars total", previous_answer.len());
        });

        Ok(rx)
    }
}
fn guess_content_type(filename: &str) -> String {
    let ext = filename
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_lowercase();

    match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg".to_string(),
        "png" => "image/png".to_string(),
        "gif" => "image/gif".to_string(),
        "webp" => "image/webp".to_string(),
        "svg" => "image/svg+xml".to_string(),
        "bmp" => "image/bmp".to_string(),
        "tiff" | "tif" => "image/tiff".to_string(),
        "pdf" => "application/pdf".to_string(),
        "txt" => "text/plain".to_string(),
        "csv" => "text/csv".to_string(),
        "json" => "application/json".to_string(),
        "md" => "text/markdown".to_string(),
        _ => "application/octet-stream".to_string(),
    }
}

mod dirs_next {
    use std::path::PathBuf;

    pub fn home_dir() -> Option<PathBuf> {
        std::env::var("HOME").ok().map(PathBuf::from)
    }
}

