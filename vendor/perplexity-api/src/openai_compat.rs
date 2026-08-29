use axum::{
    extract::Path,
    http::StatusCode,
    response::{
        sse::{Event, Sse},
        IntoResponse, Response,
    },
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::convert::Infallible;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

use crate::perplexity::{Attachment, PerplexityClient};

const AVAILABLE_MODELS: &[(&str, &str)] = &[
    ("experimental",          "Sonar"),
    ("gemini30flash",         "Gemini 3 Flash"),
    ("gemini30pro",           "Gemini 3 Pro"),
    ("gpt52",                 "GPT-5.2"),
    ("claude45sonnet",        "Claude Sonnet 4.5"),
    ("claude45sonnetthinking","Claude Sonnet 4.5 (Thinking)"),
    ("claude46opus",          "Claude Opus 4.6"),
    ("grok41nonreasoning",    "Grok 4.1"),
    ("kimik25thinking",       "Kimi K2.5"),
];

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct ChatCompletionRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    #[serde(default)]
    pub stream: bool,
    #[serde(default)]
    pub temperature: Option<f64>,
    #[serde(default)]
    pub max_tokens: Option<u64>,
    #[serde(default)]
    pub top_p: Option<f64>,
    #[serde(default)]
    pub frequency_penalty: Option<f64>,
    #[serde(default)]
    pub presence_penalty: Option<f64>,
    #[serde(default)]
    pub n: Option<u32>,
    #[serde(default)]
    pub stop: Option<Value>,
    #[serde(default)]
    pub user: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct ChatMessage {
    pub role: String,
    pub content: MessageContent,
    #[serde(default)]
    pub name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum MessageContent {
    Text(String),
    Parts(Vec<ContentPart>),
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum ContentPart {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image_url")]
    ImageUrl { image_url: ImageUrl },
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct ImageUrl {
    pub url: String,
    #[serde(default)]
    pub detail: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ChatCompletionResponse {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub model: String,
    pub choices: Vec<Choice>,
    pub usage: Usage,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_fingerprint: Option<String>,
    pub service_tier: String,
}

#[derive(Debug, Serialize)]
pub struct Choice {
    pub index: u32,
    pub message: ResponseMessage,
    pub finish_reason: String,
    pub logprobs: Option<Value>,
}

#[derive(Debug, Serialize)]
pub struct ResponseMessage {
    pub role: String,
    pub content: String,
    pub refusal: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Usage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

#[derive(Debug, Serialize)]
pub struct ChatCompletionChunk {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub model: String,
    pub choices: Vec<ChunkChoice>,
}

#[derive(Debug, Serialize)]
pub struct ChunkChoice {
    pub index: u32,
    pub delta: Delta,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Delta {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ModelObject {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub owned_by: String,
}

#[derive(Debug, Serialize)]
pub struct ListModelsResponse {
    pub object: String,
    pub data: Vec<ModelObject>,
}

#[derive(Debug, Serialize)]
pub struct OpenAIError {
    pub error: OpenAIErrorBody,
}

#[derive(Debug, Serialize)]
pub struct OpenAIErrorBody {
    pub message: String,
    #[serde(rename = "type")]
    pub error_type: String,
    pub param: Option<String>,
    pub code: Option<String>,
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn error_response(
    status: StatusCode,
    message: impl Into<String>,
    error_type: impl Into<String>,
) -> (StatusCode, Json<OpenAIError>) {
    (
        status,
        Json(OpenAIError {
            error: OpenAIErrorBody {
                message: message.into(),
                error_type: error_type.into(),
                param: None,
                code: None,
            },
        }),
    )
}

pub async fn list_models() -> Json<ListModelsResponse> {
    let data: Vec<ModelObject> = AVAILABLE_MODELS
        .iter()
        .map(|(id, _)| ModelObject {
            id: id.to_string(),
            object: "model".to_string(),
            created: 1700000000,
            owned_by: "perplexity".to_string(),
        })
        .collect();

    Json(ListModelsResponse {
        object: "list".to_string(),
        data,
    })
}

pub async fn get_model(
    Path(model_id): Path<String>,
) -> Result<Json<ModelObject>, (StatusCode, Json<OpenAIError>)> {
    let exists = AVAILABLE_MODELS.iter().any(|(id, _)| *id == model_id);

    if !exists {
        return Err(error_response(
            StatusCode::NOT_FOUND,
            format!("The model '{}' does not exist", model_id),
            "invalid_request_error",
        ));
    }

    Ok(Json(ModelObject {
        id: model_id,
        object: "model".to_string(),
        created: 1700000000,
        owned_by: "perplexity".to_string(),
    }))
}

pub async fn create_chat_completion(
    Json(request): Json<ChatCompletionRequest>,
) -> Result<Response, (StatusCode, Json<OpenAIError>)> {
    tracing::info!(
        "POST /v1/chat/completions - model: {}, messages: {}, stream: {}",
        request.model,
        request.messages.len(),
        request.stream
    );

    if request.messages.is_empty() {
        return Err(error_response(
            StatusCode::BAD_REQUEST,
            "messages must be a non-empty array",
            "invalid_request_error",
        ));
    }

    let perplexity_model = &request.model;
    let (query, image_urls) = extract_query_and_images(&request.messages);

    if query.is_empty() {
        return Err(error_response(
            StatusCode::BAD_REQUEST,
            "No text content found in messages",
            "invalid_request_error",
        ));
    }

    let client = PerplexityClient::new();

    let attachments = if !image_urls.is_empty() {
        match download_and_upload_images(&client, &image_urls).await {
            Ok(atts) => atts,
            Err(e) => {
                tracing::error!("Image upload failed: {}", e);
                Vec::new()
            }
        }
    } else {
        Vec::new()
    };

    let completion_id = format!("chatcmpl-{}", Uuid::new_v4().to_string().replace('-', ""));
    let created = now_unix();

    if request.stream {
        return Ok(handle_streaming(
            client,
            &query,
            perplexity_model,
            &attachments,
            completion_id,
            created,
            request.model.clone(),
        )
        .await
        .into_response());
    }

    match client
        .get_answer_with_attachments(&query, perplexity_model, &attachments)
        .await
    {
        Ok(response) => {
            let answer = &response.answer;
            let prompt_tokens = (query.len() / 4) as u32;
            let completion_tokens = (answer.len() / 4) as u32;

            let resp = ChatCompletionResponse {
                id: completion_id,
                object: "chat.completion".to_string(),
                created,
                model: request.model,
                choices: vec![Choice {
                    index: 0,
                    message: ResponseMessage {
                        role: "assistant".to_string(),
                        content: answer.clone(),
                        refusal: None,
                    },
                    finish_reason: "stop".to_string(),
                    logprobs: None,
                }],
                usage: Usage {
                    prompt_tokens,
                    completion_tokens,
                    total_tokens: prompt_tokens + completion_tokens,
                },
                system_fingerprint: Some("fp_perplexity".to_string()),
                service_tier: "default".to_string(),
            };

            Ok(Json(resp).into_response())
        }
        Err(e) => {
            tracing::error!("Perplexity error: {}", e);

            let (status, error_type) = if e.to_string().contains("403") {
                (StatusCode::FORBIDDEN, "authentication_error")
            } else if e.to_string().contains("429") {
                (StatusCode::TOO_MANY_REQUESTS, "rate_limit_error")
            } else if e.to_string().contains("Cloudflare") {
                (StatusCode::SERVICE_UNAVAILABLE, "server_error")
            } else {
                (StatusCode::INTERNAL_SERVER_ERROR, "server_error")
            };

            Err(error_response(status, e.to_string(), error_type))
        }
    }
}

fn extract_query_and_images(messages: &[ChatMessage]) -> (String, Vec<String>) {
    let mut parts: Vec<String> = Vec::new();
    let mut image_urls: Vec<String> = Vec::new();

    for msg in messages {
        let role_label = match msg.role.as_str() {
            "system" | "developer" => "System",
            "assistant" => "Assistant",
            "user" => "User",
            other => other,
        };

        match &msg.content {
            MessageContent::Text(text) => {
                if !text.is_empty() {
                    parts.push(format!("{}: {}", role_label, text));
                }
            }
            MessageContent::Parts(content_parts) => {
                let mut text_parts = Vec::new();
                for part in content_parts {
                    match part {
                        ContentPart::Text { text } => {
                            text_parts.push(text.clone());
                        }
                        ContentPart::ImageUrl { image_url } => {
                            image_urls.push(image_url.url.clone());
                        }
                    }
                }
                if !text_parts.is_empty() {
                    parts.push(format!("{}: {}", role_label, text_parts.join(" ")));
                }
            }
        }
    }

    let query = if parts.len() == 1 {
        let single = &parts[0];
        if let Some(stripped) = single.strip_prefix("User: ") {
            stripped.to_string()
        } else {
            single.clone()
        }
    } else {
        parts.join("\n\n")
    };

    (query, image_urls)
}

async fn download_and_upload_images(
    client: &PerplexityClient,
    image_urls: &[String],
) -> anyhow::Result<Vec<Attachment>> {
    let http_client = reqwest::Client::new();
    let mut attachments = Vec::new();
    let temp_dir = std::env::temp_dir();

    for (i, url) in image_urls.iter().enumerate() {
        if url.starts_with("data:") {
            if let Some(attachment) = handle_data_uri(client, url, i, &temp_dir).await? {
                attachments.push(attachment);
            }
            continue;
        }

        tracing::info!("Downloading image from: {}...", &url[..url.len().min(80)]);
        let resp = http_client
            .get(url)
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("Failed to download image: {}", e))?;

        if !resp.status().is_success() {
            tracing::warn!("Failed to download image ({}): {}", resp.status(), url);
            continue;
        }

        let content_type = resp
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("image/jpeg")
            .to_string();

        let filename = url
            .rsplit('/')
            .next()
            .unwrap_or("image.jpg")
            .split('?')
            .next()
            .unwrap_or("image.jpg")
            .to_string();

        let bytes = resp
            .bytes()
            .await
            .map_err(|e| anyhow::anyhow!("Failed to read image bytes: {}", e))?;

        let temp_path = temp_dir.join(format!("openai_img_{}_{}", i, &filename));
        tokio::fs::write(&temp_path, &bytes).await?;

        let file_paths = vec![temp_path.clone()];
        match client.upload_files(&file_paths).await {
            Ok(uploaded) => {
                let _ = tokio::fs::remove_file(&temp_path).await;
                for f in uploaded {
                    attachments.push(Attachment {
                        url: f.s3_url,
                        content_type: content_type.clone(),
                        filename: f.filename,
                    });
                }
            }
            Err(e) => {
                let _ = tokio::fs::remove_file(&temp_path).await;
                tracing::error!("Failed to upload image to S3: {}", e);
            }
        }
    }

    Ok(attachments)
}

async fn handle_data_uri(
    client: &PerplexityClient,
    data_uri: &str,
    index: usize,
    temp_dir: &std::path::Path,
) -> anyhow::Result<Option<Attachment>> {
    let parts: Vec<&str> = data_uri.splitn(2, ',').collect();
    if parts.len() != 2 {
        tracing::warn!("Invalid data URI format");
        return Ok(None);
    }

    let meta = parts[0];
    let base64_data = parts[1];

    let content_type = meta
        .strip_prefix("data:")
        .and_then(|s| s.split(';').next())
        .unwrap_or("image/jpeg")
        .to_string();

    let ext = match content_type.as_str() {
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => "bin",
    };

    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| anyhow::anyhow!("Failed to decode base64 image: {}", e))?;

    let filename = format!("image_{}.{}", index, ext);
    let temp_path = temp_dir.join(format!("openai_b64_{}_{}", index, &filename));
    tokio::fs::write(&temp_path, &bytes).await?;

    let file_paths = vec![temp_path.clone()];
    match client.upload_files(&file_paths).await {
        Ok(uploaded) => {
            let _ = tokio::fs::remove_file(&temp_path).await;
            if let Some(f) = uploaded.into_iter().next() {
                return Ok(Some(Attachment {
                    url: f.s3_url,
                    content_type,
                    filename: f.filename,
                }));
            }
        }
        Err(e) => {
            let _ = tokio::fs::remove_file(&temp_path).await;
            tracing::error!("Failed to upload base64 image: {}", e);
        }
    }

    Ok(None)
}

async fn handle_streaming(
    client: PerplexityClient,
    query: &str,
    model: &str,
    attachments: &[Attachment],
    completion_id: String,
    created: u64,
    model_name: String,
) -> Sse<impl futures::Stream<Item = Result<Event, Infallible>>> {
    let rx_result = client.stream_answer(query, model, attachments).await;

    let id = completion_id;
    let model_out = model_name;

    let stream = async_stream::stream! {
        let first = ChatCompletionChunk {
            id: id.clone(),
            object: "chat.completion.chunk".to_string(),
            created,
            model: model_out.clone(),
            choices: vec![ChunkChoice {
                index: 0,
                delta: Delta {
                    role: Some("assistant".to_string()),
                    content: None,
                },
                finish_reason: None,
            }],
        };
        yield Ok(Event::default().data(serde_json::to_string(&first).unwrap()));

        match rx_result {
            Ok(mut rx) => {
                while let Some(delta_text) = rx.recv().await {
                    let chunk = ChatCompletionChunk {
                        id: id.clone(),
                        object: "chat.completion.chunk".to_string(),
                        created,
                        model: model_out.clone(),
                        choices: vec![ChunkChoice {
                            index: 0,
                            delta: Delta {
                                role: None,
                                content: Some(delta_text),
                            },
                            finish_reason: None,
                        }],
                    };
                    yield Ok(Event::default().data(serde_json::to_string(&chunk).unwrap()));
                }
            }
            Err(e) => {
                let chunk = ChatCompletionChunk {
                    id: id.clone(),
                    object: "chat.completion.chunk".to_string(),
                    created,
                    model: model_out.clone(),
                    choices: vec![ChunkChoice {
                        index: 0,
                        delta: Delta {
                            role: None,
                            content: Some(format!("Error: {}", e)),
                        },
                        finish_reason: None,
                    }],
                };
                yield Ok(Event::default().data(serde_json::to_string(&chunk).unwrap()));
            }
        }

        let final_chunk = ChatCompletionChunk {
            id: id.clone(),
            object: "chat.completion.chunk".to_string(),
            created,
            model: model_out.clone(),
            choices: vec![ChunkChoice {
                index: 0,
                delta: Delta {
                    role: None,
                    content: None,
                },
                finish_reason: Some("stop".to_string()),
            }],
        };
        yield Ok(Event::default().data(serde_json::to_string(&final_chunk).unwrap()));

        yield Ok(Event::default().data("[DONE]"));
    };

    Sse::new(stream)
}
