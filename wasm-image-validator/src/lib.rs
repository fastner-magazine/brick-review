use image::{DynamicImage, GenericImageView};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

// パニック時のエラーメッセージを改善
#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

/// 画像品質判定結果
#[derive(Serialize, Deserialize)]
#[wasm_bindgen]
pub struct ImageQualityResult {
    /// ブレ検出スコア（高いほどシャープ、低いほどブレている）
    pub blur_score: f64,
    /// ブレているかどうか（true = ブレている）
    pub is_blurry: bool,
    /// 明るさスコア（0-1の範囲、0.5が適切）
    pub brightness: f64,
    /// 暗すぎるかどうか
    pub is_too_dark: bool,
    /// 明るすぎるかどうか
    pub is_too_bright: bool,
    /// 全体的に品質が良いかどうか
    pub is_good_quality: bool,
}

#[wasm_bindgen]
impl ImageQualityResult {
    /// JSON文字列として取得
    pub fn to_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(self).map_err(|e| JsValue::from_str(&e.to_string()))
    }
}

/// Base64エンコードされた画像データから品質を判定
#[wasm_bindgen]
pub fn validate_image_quality(base64_data: &str) -> Result<ImageQualityResult, JsValue> {
    // "data:image/jpeg;base64," のプレフィックスを削除
    let base64_data = if let Some(idx) = base64_data.find("base64,") {
        &base64_data[idx + 7..]
    } else {
        base64_data
    };

    // Base64デコード
    use base64::Engine;
    let engine = base64::engine::general_purpose::STANDARD;
    let image_data = engine.decode(base64_data).map_err(|e| {
        JsValue::from_str(&format!("Base64 decode error: {}", e))
    })?;

    // 画像をロード
    let img = image::load_from_memory(&image_data).map_err(|e| {
        JsValue::from_str(&format!("Image load error: {}", e))
    })?;

    // 品質判定を実行
    Ok(analyze_image_quality(&img))
}

/// 画像の品質を分析
fn analyze_image_quality(img: &DynamicImage) -> ImageQualityResult {
    // ブレ検出
    let blur_score = calculate_blur_score(img);
    let is_blurry = blur_score < 100.0; // 閾値: 100以下はブレている

    // 明るさ判定
    let brightness = calculate_brightness(img);
    let is_too_dark = brightness < 0.3;
    let is_too_bright = brightness > 0.8;

    // 全体的な品質判定
    let is_good_quality = !is_blurry && !is_too_dark && !is_too_bright;

    ImageQualityResult {
        blur_score,
        is_blurry,
        brightness,
        is_too_dark,
        is_too_bright,
        is_good_quality,
    }
}

/// Laplacian variance法でブレスコアを計算
/// スコアが高いほどシャープ、低いほどブレている
fn calculate_blur_score(img: &DynamicImage) -> f64 {
    // グレースケールに変換
    let gray = img.to_luma8();
    let (width, height) = gray.dimensions();

    if width < 3 || height < 3 {
        return 0.0;
    }

    // Laplacianカーネル
    // [[ 0,  1,  0],
    //  [ 1, -4,  1],
    //  [ 0,  1,  0]]
    let mut laplacian_values: Vec<f64> = Vec::new();

    // エッジ付近を除いた領域でLaplacianを計算
    for y in 1..(height - 1) {
        for x in 1..(width - 1) {
            let center = gray.get_pixel(x, y)[0] as f64;
            let top = gray.get_pixel(x, y - 1)[0] as f64;
            let bottom = gray.get_pixel(x, y + 1)[0] as f64;
            let left = gray.get_pixel(x - 1, y)[0] as f64;
            let right = gray.get_pixel(x + 1, y)[0] as f64;

            let laplacian = top + bottom + left + right - 4.0 * center;
            laplacian_values.push(laplacian);
        }
    }

    // 分散を計算
    if laplacian_values.is_empty() {
        return 0.0;
    }

    let mean: f64 = laplacian_values.iter().sum::<f64>() / laplacian_values.len() as f64;
    let variance: f64 = laplacian_values
        .iter()
        .map(|&v| (v - mean).powi(2))
        .sum::<f64>()
        / laplacian_values.len() as f64;

    variance
}

/// 画像の明るさを計算（0-1の範囲）
fn calculate_brightness(img: &DynamicImage) -> f64 {
    let (width, height) = img.dimensions();
    let mut total_brightness = 0.0;
    let total_pixels = (width * height) as f64;

    // RGBから輝度を計算（Rec. 709の係数を使用）
    for y in 0..height {
        for x in 0..width {
            let pixel = img.get_pixel(x, y);
            let r = pixel[0] as f64 / 255.0;
            let g = pixel[1] as f64 / 255.0;
            let b = pixel[2] as f64 / 255.0;

            // Rec. 709 luma係数
            let brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            total_brightness += brightness;
        }
    }

    total_brightness / total_pixels
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_brightness_calculation() {
        // 100x100の白い画像を作成
        let white_img = DynamicImage::ImageRgb8(
            ImageBuffer::from_fn(100, 100, |_, _| image::Rgb([255, 255, 255])),
        );
        let brightness = calculate_brightness(&white_img);
        assert!((brightness - 1.0).abs() < 0.01);

        // 黒い画像
        let black_img = DynamicImage::ImageRgb8(
            ImageBuffer::from_fn(100, 100, |_, _| image::Rgb([0, 0, 0])),
        );
        let brightness = calculate_brightness(&black_img);
        assert!((brightness - 0.0).abs() < 0.01);
    }
}
