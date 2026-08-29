mod openai_compat;
mod perplexity;
mod routes;

use axum::{
    extract::Request,
    http::{HeaderMap, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use serde_json::json;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use uuid::Uuid;

async fn auth(headers: HeaderMap, request: Request, next: Next) -> Response {
    let api_key = match std::env::var("API_KEY") {
        Ok(key) if !key.is_empty() => key,
        _ => return next.run(request).await,
    };

    let auth_header = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let provided_key = auth_header
        .strip_prefix("Bearer ")
        .unwrap_or(auth_header);

    if provided_key == api_key {
        next.run(request).await
    } else {
        (
            StatusCode::UNAUTHORIZED,
            Json(json!({
                "error": {
                    "message": "Invalid API key provided.",
                    "type": "invalid_request_error",
                    "param": serde_json::Value::Null,
                    "code": "invalid_api_key"
                }
            })),
        )
            .into_response()
    }
}

#[tokio::main]
async fn main() {
    let _ = dotenvy::dotenv();

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "perplexity_api=debug,tower_http=debug".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("🚀 Starting Perplexity API Server (OpenAI-compatible)...");

    match std::env::var("API_KEY") {
        Ok(key) if !key.is_empty() => {
            tracing::info!("🔑 API key loaded from environment");
            tracing::info!("   Key: {}...{}", &key[..4.min(key.len())], &key[key.len().saturating_sub(4)..]);
        }
        _ => {
            let generated = format!("sk-{}", Uuid::new_v4().to_string().replace('-', ""));
            tracing::warn!("⚠️  No API_KEY set! Running in OPEN mode (no auth).");
            tracing::warn!("   To secure your server, add to .env:");
            tracing::warn!("   API_KEY={}", generated);
        }
    }

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/", get(routes::health))
        .route("/health", get(routes::health))
        .route("/v1/chat/completions", post(openai_compat::create_chat_completion))
        .route("/v1/models", get(openai_compat::list_models))
        .route("/v1/models/:model_id", get(openai_compat::get_model))
        .layer(middleware::from_fn(auth))
        .layer(cors)
        .layer(TraceLayer::new_for_http());

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3030);
    // The desktop embeds this bridge as a local provider. Keep the upstream
    // standalone server local by default; deployments that intentionally need
    // LAN access can opt in with HOST=0.0.0.0.
    let host = std::env::var("HOST")
        .ok()
        .and_then(|value| value.parse::<IpAddr>().ok())
        .unwrap_or(IpAddr::V4(Ipv4Addr::LOCALHOST));
    let addr = SocketAddr::from((host, port));
    tracing::info!("📡 Listening on http://{}", addr);
    tracing::info!("📚 Endpoints:");
    tracing::info!("   POST /v1/chat/completions  - Chat completions");
    tracing::info!("   GET  /v1/models            - List models");
    tracing::info!("   GET  /v1/models/:id        - Get model info");
    tracing::info!("💡 Point any OpenAI SDK at http://localhost:{}/v1", port);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
