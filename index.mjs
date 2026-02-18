import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_CONFIG = {
    apiKey: "",
    model: "glm-image",
    size: "1280x1280",
    quality: "hd",
    watermarkEnabled: true,
};

let currentConfig = { ...DEFAULT_CONFIG };

function loadConfig(ctx) {
    const configFilePath = ctx.configPath;
    try {
        if (fs.existsSync(configFilePath)) {
            const raw = fs.readFileSync(configFilePath, "utf-8");
            const loaded = JSON.parse(raw);
            currentConfig = { ...DEFAULT_CONFIG, ...loaded };
            ctx.logger.info("[GLM-Image] 配置已加载");
        } else {
            saveConfig(ctx, DEFAULT_CONFIG);
        }
    } catch (e) {
        ctx.logger.error("[GLM-Image] 加载配置失败", e);
    }
}

function saveConfig(ctx, newConfig) {
    const configFilePath = ctx.configPath;
    try {
        currentConfig = { ...currentConfig, ...newConfig };
        const dir = path.dirname(configFilePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(configFilePath, JSON.stringify(currentConfig, null, 2), "utf-8");
        ctx.logger.info("[GLM-Image] 配置已保存");
    } catch (e) {
        ctx.logger.error("[GLM-Image] 保存配置失败", e);
    }
}

function buildConfigUI(ctx) {
    const { NapCatConfig } = ctx;
    return NapCatConfig.combine(
        NapCatConfig.html('<div style="padding:10px; border-bottom:1px solid #ccc;"><h3>GLM 图像生成插件</h3><br>API 申请地址： <a href="https://bigmodel.cn/">https://bigmodel.cn/</a><br>指令：生图 + 关键词 &nbsp;|&nbsp; /draw + 关键词</div>'),
        NapCatConfig.text("apiKey", "API Key", DEFAULT_CONFIG.apiKey, "请输入您的智谱 AI API Key (sk-xxx...)"),
        NapCatConfig.text("model", "模型", DEFAULT_CONFIG.model, "可选: glm-image / cogview-4-250304 / cogview-4 / cogview-3-flash"),
        NapCatConfig.text("size", "图片尺寸", DEFAULT_CONFIG.size, "glm-image 推荐: 1280x1280 / 1568x1056 / 1056x1568"),
        NapCatConfig.text("quality", "质量", DEFAULT_CONFIG.quality, "hd（精细，约20s）或 standard（快速，5-10s），glm-image 仅支持 hd"),
        NapCatConfig.text("watermarkEnabled", "是否加水印", String(DEFAULT_CONFIG.watermarkEnabled), "true 或 false"),
    );
}

// Helper to call OneBot API
async function callOB11(ctx, action, params) {
    try {
        return await ctx.actions.call(action, params, ctx.adapterName, ctx.pluginManager.config);
    } catch (e) {
        ctx.logger.error(`[GLM-Image] Call OB11 ${action} failed:`, e);
    }
}

// 消息段工具函数
function textSegment(text) {
    return { type: 'text', data: { text } };
}
function imageSegment(file) {
    return { type: 'image', data: { file } };
}
async function sendGroupMsg(ctx, groupId, message) {
    return callOB11(ctx, 'send_msg', {
        message_type: 'group',
        group_id: String(groupId),
        message: typeof message === 'string' ? [textSegment(message)] : message,
    });
}

// 调用智谱 GLM 图像生成 API（同步接口，直接返回图片 URL）
async function generateImage(prompt) {
    const body = {
        model: currentConfig.model,
        prompt: prompt,
        size: currentConfig.size,
        watermark_enabled: currentConfig.watermarkEnabled === true || currentConfig.watermarkEnabled === 'true',
    };

    // glm-image 不支持 quality 参数
    if (currentConfig.model !== "glm-image") {
        body.quality = currentConfig.quality;
    }

    const res = await fetch("https://open.bigmodel.cn/api/paas/v4/images/generations", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${currentConfig.apiKey}`,
        },
        body: JSON.stringify(body),
    });

    const json = await res.json();

    if (!res.ok) {
        throw new Error(`API 错误 ${res.status}: ${json?.error?.message || JSON.stringify(json)}`);
    }

    // 内容安全拦截检测
    if (json.content_filter?.length) {
        const blocked = json.content_filter.find(f => f.level <= 1);
        if (blocked) {
            throw new Error("内容被安全策略拦截，请修改描述后重试");
        }
    }

    const url = json?.data?.[0]?.url;
    if (!url) {
        throw new Error("API 未返回图片 URL，请检查 API Key 或提示词");
    }

    return url;
}

async function onMessage(ctx, event) {
    if (event.message_type !== "group") return;

    const msg = event.raw_message?.trim() || "";

    if (msg.startsWith("/draw ") || msg.startsWith("生图 ")) {
        const prompt = msg.replace(/^\/draw\s+|^生图\s+/, "").trim();
        if (!prompt) return;

        const groupId = event.group_id;

        if (!currentConfig.apiKey) {
            await sendGroupMsg(ctx, groupId, "⚠️ 未配置 API Key，请联系管理员配置 GLM-Image 插件。");
            return;
        }

        await sendGroupMsg(ctx, groupId, `🎨 已收到生图请求，正在生成中: ${prompt}`);

        try {
            const imageUrl = await generateImage(prompt);
            ctx.logger.info(`[GLM-Image] 生成成功: ${imageUrl}`);
            await sendGroupMsg(ctx, groupId, [imageSegment(imageUrl)]);
        } catch (e) {
            ctx.logger.error("[GLM-Image] 生成失败", e);
            await sendGroupMsg(ctx, groupId, `❌ 生成失败: ${e.message}`);
        }
    }
}

// ============================================================
// 插件生命周期导出
// ============================================================
export let plugin_config_ui = [];

export async function plugin_init(ctx) {
    ctx.logger.info("[GLM-Image] 插件加载中...");
    loadConfig(ctx);
    plugin_config_ui = buildConfigUI(ctx);
}

export async function plugin_onmessage(ctx, event) {
    if (event.post_type !== 'message') return;
    await onMessage(ctx, event);
}

export async function plugin_cleanup(ctx) {
    ctx.logger.info("[GLM-Image] 插件已卸载");
}

export async function plugin_get_config(ctx) {
    return currentConfig;
}

export async function plugin_set_config(ctx, config) {
    currentConfig = { ...DEFAULT_CONFIG, ...config };
    saveConfig(ctx, currentConfig);
    ctx.logger.info("[GLM-Image] 配置已通过 WebUI 更新");
}

export async function plugin_on_config_change(ctx, _, key, value) {
    saveConfig(ctx, { [key]: value });
}
