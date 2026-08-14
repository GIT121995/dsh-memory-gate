/**
 * Retrieval-side text utilities: CJK normalization, term extraction with
 * synonym folding, and learned-term merging.
 *
 * Both the write path (claims.terms_json) and the query path run through
 * `extractTerms`, so simplified/traditional and full-width/half-width
 * variants of the same text converge on identical terms.
 * @module dsh-memory-gate/text
 */
/** Common traditional → simplified character pairs (single BMP chars, high-confidence). */
const TRADITIONAL_TO_SIMPLIFIED = {
    憶: '忆', 門: '门', 說: '说', 時: '时', 後: '后', 開: '开', 關: '关', 會: '会',
    來: '来', 個: '个', 對: '对', 現: '现', 機: '机', 體: '体', 係: '系', 統: '统',
    軟: '软', 碼: '码', 錯: '错', 誤: '误', 網: '网', 絡: '络', 數: '数', 據: '据',
    庫: '库', 測: '测', 試: '试', 項: '项', 車: '车', 東: '东', 長: '长', 語: '语',
    寫: '写', 讀: '读', 學: '学', 覺: '觉', 應: '应', 該: '该', 讓: '让', 給: '给',
    從: '从', 還: '还', 沒: '没', 進: '进', 發: '发', 問: '问', 題: '题', 處: '处',
    圖: '图', 報: '报', 檔: '档', 設: '设', 屬: '属', 參: '参', 刪: '删', 創: '创',
    變: '变', 實: '实', 驗: '验', 證: '证', 檢: '检', 執: '执', 運: '运', 轉: '转',
    換: '换', 選: '选', 擇: '择', 導: '导', 輸: '输', 傳: '传', 連: '连', 斷: '断',
    複: '复', 節: '节', 點: '点', 緩: '缓', 準: '准', 確: '确', 異: '异', 遠: '远',
    邊: '边', 頁: '页', 視: '视', 標: '标', 簽: '签', 鈕: '钮', 鍵: '键', 盤: '盘',
    瀏: '浏', 覽: '览', 啟: '启', 動: '动', 繼: '继', 續: '续', 結: '结', 敗: '败',
    資: '资', 費: '费', 價: '价', 優: '优', 級: '级', 別: '别', 類: '类', 塊: '块',
    組: '组', 賴: '赖', 環: '环', 調: '调', 場: '场', 幫: '帮', 號: '号', 誌: '志',
    佈: '布', 遷: '迁', 備: '备', 復: '复', 製: '制', 壓: '压', 縮: '缩', 編: '编',
    譯: '译', 構: '构', 獲: '获', 載: '载', 狀: '状', 態: '态', 電: '电', 腦: '脑',
    帳: '帐', 戶: '户', 錄: '录', 冊: '册', 鑰: '钥', 憑: '凭', 權: '权', 隱: '隐',
    護: '护', 審: '审', 計: '计', 話: '话', 頻: '频', 詞: '词', 簡: '简', 稱: '称',
    預: '预', 認: '认', 許: '许', 絕: '绝', 責: '责', 風: '风', 險: '险', 擊: '击',
    攔: '拦', 過: '过', 濾: '滤', 併: '并', 歸: '归', 籤: '签', 補: '补', 衝: '冲',
    齊: '齐', 遞: '递', 達: '达', 義: '义', 舉: '举', 樣: '样', 務: '务', 專: '专',
    業: '业', 員: '员', 單: '单', 雙: '双', 難: '难', 約: '约', 紅: '红', 綠: '绿',
    藍: '蓝', 黃: '黄', 馬: '马', 鳥: '鸟', 魚: '鱼', 醫: '医', 藥: '药', 錢: '钱',
    銀: '银', 賬: '账', 記: '记', 識: '识', 諒: '谅', 詳: '详', 細: '细', 緒: '绪',
    績: '绩', 總: '总', 練: '练', 線: '线', 緯: '纬', 緣: '缘', 縣: '县', 繹: '绎',
    罰: '罚', 罷: '罢', 羅: '罗', 習: '习', 聯: '联', 聲: '声', 聰: '聪', 職: '职',
    聽: '听', 脅: '胁', 腳: '脚', 臉: '脸', 脫: '脱', 臘: '腊', 舊: '旧', 與: '与',
    興: '兴', 蟲: '虫', 術: '术', 衛: '卫', 裝: '装', 裡: '里', 裏: '里', 規: '规',
    觀: '观', 觸: '触', 討: '讨', 訓: '训', 訪: '访', 診: '诊', 註: '注', 評: '评',
    詢: '询', 請: '请', 諸: '诸', 課: '课', 誰: '谁', 論: '论', 談: '谈', 謀: '谋',
    謝: '谢', 議: '议', 讚: '赞', 貳: '贰', 買: '买', 賣: '卖', 貴: '贵', 貿: '贸',
    貸: '贷', 質: '质', 贈: '赠', 賽: '赛', 贏: '赢', 負: '负', 賓: '宾', 賞: '赏',
    賢: '贤', 贖: '赎', 軌: '轨', 較: '较', 輔: '辅', 輕: '轻', 辦: '办', 違: '违',
    遲: '迟', 遺: '遗', 鄉: '乡', 郵: '邮', 鄰: '邻', 鄭: '郑', 釋: '释', 鐘: '钟',
    鋼: '钢', 鐵: '铁', 銅: '铜', 鎖: '锁', 鎮: '镇', 鏡: '镜', 閉: '闭', 閒: '闲',
    間: '间', 聞: '闻', 閩: '闽', 閱: '阅', 隊: '队', 階: '阶', 陽: '阳', 陰: '阴',
    陳: '陈', 陸: '陆', 隨: '随', 際: '际', 雖: '虽', 霧: '雾', 靜: '静', 順: '顺',
    領: '领', 頭: '头', 額: '额', 顏: '颜', 顧: '顾', 顯: '显', 飛: '飞', 飯: '饭',
    飲: '饮', 養: '养', 餘: '余', 館: '馆', 駐: '驻', 駕: '驾', 驚: '惊', 髮: '发',
    鬆: '松', 黨: '党', 齒: '齿', 齡: '龄', 龍: '龙', 龜: '龟', 閘: '闸', 漢: '汉',
};
/** Han characters that add no retrieval signal inside bigrams. */
const HAN_STOP_CHARS = new Set(('的了是在有我你他她它这那们个不就要也都很还更已经因为所以如果那么怎么什么为与和或而但被让把对从到等吧吗呢啊哦嗯之其及由至以于则').split(''));
/** Latin stopwords. `always` / `never` / `please` stay: they carry memory signal. */
const LATIN_STOPWORDS = new Set([
    'the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'with', 'by', 'at',
    'from', 'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that',
    'these', 'those', 'my', 'your', 'our', 'their', 'his', 'her', 'we', 'you', 'they',
    'he', 'she', 'me', 'us', 'do', 'does', 'did', 'not', 'no', 'yes', 'ok', 'can',
    'could', 'will', 'would', 'should', 'may', 'might', 'must', 'have', 'has', 'had',
    'what', 'when', 'where', 'which', 'who', 'why', 'how', 'if', 'then', 'than',
    'also', 'just', 'about', 'into', 'out', 'up', 'down', 'off', 'over', 'under',
]);
/**
 * Synonym groups folded on both the write and query paths. A term in any
 * group yields one stable alias token (`recall_alias_<id>`), so cross-
 * vocabulary matches survive index rebuilds and schema migrations.
 */
export const SYNONYM_GROUPS = [
    { id: 'concise', members: ['简洁', '简短', '精炼', '扼要', '短', 'concise', 'brief', '简练'] },
    { id: 'chinese', members: ['中文', '汉语', '普通话', 'chinese', '中文回答', '简体', '繁体'] },
    { id: 'answer', members: ['回答', '回复', '答复', '应答', 'answer', 'response', 'reply'] },
    { id: 'prefer', members: ['偏好', '喜欢', '喜好', '偏爱', 'prefer', 'preference', 'preferences'] },
    { id: 'project', members: ['项目', '工程', 'project', 'repo', '仓库', '代码库', 'repository'] },
    { id: 'test', members: ['测试', '验证', 'test', 'tests', 'testing', 'verify', '验证一下'] },
    { id: 'code', members: ['代码', '编码', 'code', 'coding', '源码', '实现', '编程', '写码'] },
    { id: 'deploy', members: ['部署', '上线', '发布', 'deploy', 'deployment', 'release', 'publish', '发版'] },
    { id: 'docs', members: ['文档', '说明', '手册', 'documentation', 'docs', 'readme', '指南'] },
    { id: 'config', members: ['配置', '设置', 'config', 'configuration', 'settings', '参数'] },
    { id: 'error', members: ['错误', '报错', '异常', 'bug', 'error', 'exception', '故障', '问题'] },
    { id: 'perf', members: ['性能', '速度', 'performance', '快', '优化', 'optimize', '慢'] },
    { id: 'security', members: ['安全', '密钥', '凭据', 'security', 'credentials', 'secret', 'token', '密码'] },
    { id: 'database', members: ['数据库', 'sqlite', 'db', 'database', '存储', '数据'] },
    { id: 'memory', members: ['记忆', 'memory', 'remember', '记住', '长期记忆', '备忘'] },
    { id: 'workspace', members: ['工作区', '目录', 'workspace', '路径', 'path', '文件夹'] },
    { id: 'command', members: ['命令', '指令', 'command', 'cli', '命令行'] },
    { id: 'install', members: ['安装', 'install', '依赖', 'dependency', 'dependencies', '装包'] },
    { id: 'model', members: ['模型', 'model', '模型调用', 'llm', '推理', '大模型'] },
    { id: 'ui', members: ['界面', 'ui', '前端', 'frontend', '页面', '交互'] },
    { id: 'api', members: ['api', '接口', 'endpoint', '接口调用', '请求'] },
    { id: 'session', members: ['会话', 'session', '对话', 'conversation', '聊天'] },
    { id: 'restart', members: ['重启', 'restart', '重新启动', '重载', 'reload'] },
    { id: 'version', members: ['版本', 'version', '版本号', '升级', 'upgrade', '更新'] },
    { id: 'log', members: ['日志', 'log', 'logs', '记录', '输出'] },
    { id: 'backup', members: ['备份', 'backup', '恢复', 'restore', '快照', 'snapshot'] },
    { id: 'format', members: ['格式', 'format', '风格', 'style', '样式'] },
    { id: 'schedule', members: ['计划', '安排', 'schedule', '任务', 'task', 'todo', '待办'] },
    { id: 'review', members: ['审查', '检查', 'review', '审阅', '复核', '检查一下'] },
];
const ALIAS_TOKEN = new Map();
for (const group of SYNONYM_GROUPS) {
    const alias = `recall_alias_${group.id}`;
    for (const member of group.members)
        ALIAS_TOKEN.set(member, alias);
}
/**
 * Normalize text for term extraction: NFKC (full-width → half-width,
 * compatibility forms), lower-case, and common traditional → simplified
 * conversion. Applied to both indexed content and queries.
 */
export function normalizeForTerms(value) {
    const nfkc = value.normalize('NFKC').toLocaleLowerCase();
    let out = '';
    for (const character of nfkc)
        out += TRADITIONAL_TO_SIMPLIFIED[character] ?? character;
    return out;
}
/**
 * Extract retrieval terms: Latin word runs (≥2 chars, stopwords removed),
 * Han bigrams (bigrams containing stop characters removed), plus one stable
 * alias token per matching synonym group. Order is deterministic: latin
 * terms first, then Han terms in source order.
 */
export function extractTerms(value, maxTerms = 120) {
    const normalized = normalizeForTerms(value);
    const latin = normalized.match(/[\p{Script=Latin}\p{N}_-]{2,}/gu) ?? [];
    const hanRuns = normalized.match(/[\p{Script=Han}]+/gu) ?? [];
    const han = hanRuns.flatMap((run) => {
        if (run.length === 1)
            return [];
        if (run.length === 2)
            return isHanSignal(run) ? [run] : [];
        return Array.from({ length: run.length - 1 }, (_, index) => run.slice(index, index + 2)).filter(isHanSignal);
    });
    const raw = [...latin.filter((word) => !LATIN_STOPWORDS.has(word)), ...han];
    const terms = new Set();
    for (const term of raw) {
        terms.add(term);
        const alias = ALIAS_TOKEN.get(term);
        if (alias)
            terms.add(alias);
    }
    return [...terms].slice(0, maxTerms);
}
function isHanSignal(bigram) {
    return ![...bigram].some((character) => HAN_STOP_CHARS.has(character));
}
/**
 * Merge terms learned from confirmed-helpful queries into a claim's learned
 * term list. Existing terms are preserved, duplicates and terms already
 * present in the write-time term set are skipped, and the result is capped.
 * @returns the merged list and the terms actually added.
 */
export function mergeLearnedTerms(existing, incoming, cap, baseTerms = []) {
    const blocked = new Set(baseTerms);
    const seen = new Set(existing);
    const added = [];
    for (const term of incoming) {
        if (seen.has(term) || blocked.has(term))
            continue;
        if (existing.length + added.length >= cap)
            break;
        seen.add(term);
        added.push(term);
    }
    return { terms: [...existing, ...added], added };
}
/** Build an FTS5 OR query from quoted terms (bigrams become phrase queries). */
export function buildFtsQuery(value) {
    return extractTerms(value, 24)
        .slice(0, 12)
        .map((term) => `"${term.replaceAll('"', '""')}"`)
        .join(' OR ');
}
//# sourceMappingURL=text.js.map