import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_CONFIG = {
    apiKey: "",
    apiUrl: "https://api.tavr.top/v1/index.php",
};

let currentConfig = { ...DEFAULT_CONFIG };

function loadConfig(ctx) {
    const configFilePath = ctx.configPath;
    try {
        if (fs.existsSync(configFilePath)) {
            const raw = fs.readFileSync(configFilePath, "utf-8");
            const loaded = JSON.parse(raw);
            currentConfig = { ...DEFAULT_CONFIG, ...loaded };
            ctx.logger.info("[TS-AI] 配置已加载");
        } else {
            saveConfig(ctx, DEFAULT_CONFIG);
        }
    } catch (e) {
        ctx.logger.error("[TS-AI] 加载配置失败", e);
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
        ctx.logger.info("[TS-AI] 配置已保存");
    } catch (e) {
        ctx.logger.error("[TS-AI] 保存配置失败", e);
    }
}

function buildConfigUI(ctx) {
    const { NapCatConfig } = ctx;
    return NapCatConfig.combine(
        NapCatConfig.html('<div style="padding:10px; border-bottom:1px solid #ccc;"><h3>TS-AI绘画 插件</h3><br>AI地址： <a href="https://ai.tavr.top/">https://ai.tavr.top/</a><br>指令：生图+关键词</div>'),
        NapCatConfig.text("apiKey", "API Key", DEFAULT_CONFIG.apiKey, "请输入您的 API Key (sk-...)"),
        NapCatConfig.text("apiUrl", "API URL", DEFAULT_CONFIG.apiUrl, "API 入口地址")
    );
}

// Helper to call OneBot API
async function callOB11(ctx, action, params) {
    try {
        return await ctx.actions.call(action, params, ctx.adapterName, ctx.pluginManager.config);
    } catch (e) {
        ctx.logger.error(`[TS-AI] Call OB11 ${action} failed:`, e);
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

// Fetch helper
async function callDevApi(endpoint, data = null, method = 'GET') {
    const url = `${currentConfig.apiUrl}?endpoint=${endpoint}`;
    const headers = {
        'x-api-key': currentConfig.apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'NapCat-TSAI/1.0'
    };

    const options = {
        method,
        headers,
    };

    if (data) {
        options.body = JSON.stringify(data);
    }

    try {
        // dynamic import or global fetch (Node 18+)
        const res = await fetch(url, options);
        const json = await res.json();
        return json;
    } catch (e) {
        throw new Error(`API Request Failed: ${e.message}`);
    }
}

async function pollTask(ctx, taskId, groupId) {
    const maxRetries = 60; // 2 minutes
    for (let i = 0; i < maxRetries; i++) {
        await new Promise(r => setTimeout(r, 2000));

        try {
            // Poll status URL constructed based on task_id, or just use endpoint param like script
            // The python script uses: ?endpoint=task_status&task_id=...
            // Note: The task_status endpoint requires task_id in GET param
            // fetch doesn't support params in options body for GET nicely, better append to URL

            // Re-use callDevApi logic but handle GET params
            // Modify callDevApi to accept query params? or just manual
            const url = `${currentConfig.apiUrl}?endpoint=task_status&task_id=${taskId}`;
            const res = await fetch(url, {
                headers: { 'x-api-key': currentConfig.apiKey }
            });
            const json = await res.json();

            if (json.success) {
                const status = json.data.status;
                if (status === 'completed') {
                    const imgUrl = json.data.result.image_url;
                    // Send Image
                    await sendGroupMsg(ctx, groupId, [imageSegment(imgUrl)]);
                    return;
                } else if (status === 'failed') {
                    await sendGroupMsg(ctx, groupId, `生成失败: ${json.data.error || 'Unknown error'}`);
                    return;
                }
                // Processing... continue
            }
        } catch (e) {
            ctx.logger.error("[TS-AI] Polling error", e);
        }
    }
    await sendGroupMsg(ctx, groupId, `生成超时 (Task: ${taskId})`);
}

async function onMessage(ctx, event) {
    if (event.message_type !== "group") return; // Only group for now or config?

    const msg = event.raw_message?.trim() || "";

    // Command parsing: /draw <prompt>
    if (msg.startsWith("/draw ") || msg.startsWith("生图 ")) {
        const prompt = msg.replace(/^\/draw\s+|trans\s+|生图\s+/, "").trim();
        if (!prompt) return;

        const groupId = event.group_id;
        const user = event.user_id;

        if (!currentConfig.apiKey) {
            await sendGroupMsg(ctx, groupId, "⚠️ 未配置 API Key，请联系管理员配置 TS-AI 插件。");
            return;
        }

        // Notify accepted
        await sendGroupMsg(ctx, groupId, `已收到生图请求，正在生成: ${prompt}`);

        try {
            // Call Image Generation API (RR3 Workflow)
            const payload = {
                prompt: prompt,
                workflow: "rr3",
                width: 832,
                height: 1216,
                steps: 20
            };

            const result = await callDevApi('image_generation', payload, 'POST');

            if (result.success) {
                const taskId = result.data.id;
                // Poll
                pollTask(ctx, taskId, groupId);
            } else {
                await sendGroupMsg(ctx, groupId, `请求失败: ${result.error || 'Server rejected'}`);
            }
        } catch (e) {
            await sendGroupMsg(ctx, groupId, `系统错误: ${e.message}`);
        }
    }
}

// ============================================================
// 插件生命周期导出
// ============================================================
export let plugin_config_ui = [];

export async function plugin_init(ctx) {
    ctx.logger.info("[TS-AI] 插件加载中...");
    loadConfig(ctx);
    plugin_config_ui = buildConfigUI(ctx);
}

export async function plugin_onmessage(ctx, event) {
    if (event.post_type !== 'message') return;
    await onMessage(ctx, event);
}

export async function plugin_cleanup(ctx) {
    ctx.logger.info("[TS-AI] 插件已卸载");
}

export async function plugin_get_config(ctx) {
    return currentConfig;
}

export async function plugin_set_config(ctx, config) {
    currentConfig = { ...DEFAULT_CONFIG, ...config };
    saveConfig(ctx, currentConfig);
    ctx.logger.info("[TS-AI] 配置已通过 WebUI 更新");
}

export async function plugin_on_config_change(ctx, _, key, value) {
    saveConfig(ctx, { [key]: value });
}
