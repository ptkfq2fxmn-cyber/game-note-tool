import fs from "node:fs/promises";
import path from "node:path";

const requiredEnv = ["OPENAI_API_KEY", "RAKUTEN_APP_ID", "RAKUTEN_ACCESS_KEY", "RAKUTEN_AFFILIATE_ID"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`必須の環境変数 ${key} が設定されていません。GitHub Secrets を確認してください。`);
  }
}

const gameName = (process.env.INPUT_GAME_NAME || "").trim();
const requestedArticleType = (process.env.INPUT_ARTICLE_TYPE || "auto").trim();
const noteUrl = (process.env.INPUT_NOTE_URL || "").trim();

if (!gameName) {
  throw new Error("入力 game_name が空です。workflow_dispatch の入力を確認してください。");
}

if (!["auto", "pre_release", "post_release"].includes(requestedArticleType)) {
  throw new Error(`article_type が不正です: ${requestedArticleType}`);
}

const rakutenAppId = process.env.RAKUTEN_APP_ID;
const rakutenAccessKey = process.env.RAKUTEN_ACCESS_KEY;
const rakutenAffiliateId = process.env.RAKUTEN_AFFILIATE_ID;
const openAiApiKey = process.env.OPENAI_API_KEY;

function sanitizeFileName(input) {
  return input
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function formatYmdJst(date = new Date()) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .replace(/\//g, "-");
}

function normalizeRakutenItem(item) {
  const rawPrice = item?.itemPrice;
  const itemPrice =
    typeof rawPrice === "number"
      ? `${rawPrice}円`
      : typeof rawPrice === "string" && rawPrice.trim()
        ? rawPrice
        : "未確認";

  return {
    title: item?.title || "未確認",
    salesDate: item?.salesDate || "未確認",
    itemPrice,
    itemUrl: item?.itemUrl || "未確認",
    affiliateUrl: item?.affiliateUrl || "未確認",
    hardware: item?.hardware || "未確認",
    jan: item?.jan || "未確認",
    shopName: item?.shopName || "未確認",
    reviewAverage: item?.reviewAverage || "未確認",
    reviewCount: item?.reviewCount || "未確認",
  };
}

function logRakutenItems(items) {
  console.log(`楽天検索結果：${items.length}件`);
  if (items.length > 0) {
    console.log("楽天上位5件:");
    items.slice(0, 5).forEach((item, index) => {
      const price = normalizeRakutenItem(item).itemPrice;
      console.log(`${index + 1}. ${item.title || "未確認"} | ${price} | ${item.itemUrl || "未確認"}`);
    });
  }
}

async function fetchRakutenGame(keyword) {
  const endpoint = new URL("https://openapi.rakuten.co.jp/services/api/BooksGame/Search/20170404");
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("applicationId", rakutenAppId);
  endpoint.searchParams.set("accessKey", rakutenAccessKey);
  endpoint.searchParams.set("formatVersion", "2");
  endpoint.searchParams.set("title", keyword);
  endpoint.searchParams.set("hits", "5");
  endpoint.searchParams.set("affiliateId", rakutenAffiliateId);

  console.log(`楽天APIに問い合わせ: ${endpoint.toString()}`);

  const res = await fetch(endpoint, {
    headers: {
      "User-Agent": "game-note-tool/2.0",
      "Origin": "https://ptkfq2fxmn-cyber.github.io",
      "Referer": "https://ptkfq2fxmn-cyber.github.io/game-note-tool/",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`楽天APIエラー: ${res.status} ${res.statusText} ${text}`);
  }

  const json = await res.json();
  const bookItems = Array.isArray(json.items)
    ? json.items
    : Array.isArray(json.Items)
      ? json.Items.map((entry) => entry.Item)
      : [];

  const normalizedBookItems = bookItems.map((item) =>
    normalizeRakutenItem({
      title: item?.title,
      salesDate: item?.salesDate,
      itemPrice: item?.itemPrice,
      itemUrl: item?.itemUrl,
      affiliateUrl: item?.affiliateUrl,
      hardware: item?.hardware,
      jan: item?.jan,
    }),
  );

  if (normalizedBookItems.length > 0) {
    logRakutenItems(normalizedBookItems);
    return {
      raw: json,
      item: normalizedBookItems[0],
      items: normalizedBookItems,
      source: "books_game",
    };
  }

  logRakutenItems([]);

  const itemSearchEndpoint = new URL("https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601");
  itemSearchEndpoint.searchParams.set("format", "json");
  itemSearchEndpoint.searchParams.set("applicationId", rakutenAppId);
  itemSearchEndpoint.searchParams.set("keyword", keyword);
  itemSearchEndpoint.searchParams.set("hits", "5");
  itemSearchEndpoint.searchParams.set("affiliateId", rakutenAffiliateId);

  console.log(`楽天市場APIに問い合わせ: ${itemSearchEndpoint.toString()}`);

  const itemRes = await fetch(itemSearchEndpoint, {
    headers: {
      "User-Agent": "game-note-tool/2.0",
      "Origin": "https://ptkfq2fxmn-cyber.github.io",
      "Referer": "https://ptkfq2fxmn-cyber.github.io/game-note-tool/",
    },
  });

  if (!itemRes.ok) {
    const text = await itemRes.text();
    throw new Error(`楽天市場APIエラー: ${itemRes.status} ${itemRes.statusText} ${text}`);
  }

  const itemJson = await itemRes.json();
  const ichibaItems = Array.isArray(itemJson.Items)
    ? itemJson.Items.map((entry) => entry.Item || entry)
    : Array.isArray(itemJson.items)
      ? itemJson.items
      : [];

  const normalizedIchibaItems = ichibaItems.map((item) =>
    normalizeRakutenItem({
      title: item?.itemName,
      salesDate: "未確認",
      itemPrice: item?.itemPrice,
      itemUrl: item?.itemUrl,
      affiliateUrl: item?.affiliateUrl,
      hardware: "未確認",
      jan: "未確認",
      shopName: item?.shopName,
      reviewAverage: item?.reviewAverage,
      reviewCount: item?.reviewCount,
    }),
  );

  logRakutenItems(normalizedIchibaItems);

  return {
    raw: { booksGame: json, ichiba: itemJson },
    item: normalizedIchibaItems[0] || null,
    items: normalizedIchibaItems,
    source: "ichiba_item",
  };
}

function resolveArticleType(requestType, salesDate) {
  if (requestType === "pre_release" || requestType === "post_release") return requestType;

  const parsed = new Date(salesDate);
  if (salesDate === "未確認" || Number.isNaN(parsed.getTime())) return "pre_release";
  return parsed.getTime() > Date.now() ? "pre_release" : "post_release";
}

function extractOutputText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const texts = [];

  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string" && content.text.trim()) {
        texts.push(content.text);
      }
    }
  }

  return texts.join("\n").trim();
}

async function generateByOpenAI(context) {
  const safeNoteUrl = context.noteUrl || "（note公開後にURLを入れる）";
  const systemPrompt = `あなたは日本語の編集者です。指定フォーマットに厳密に従って出力してください。\n
絶対ルール:\n- 推測で事実を埋めない\n- 入力にない事実を創作しない\n- 確認できない情報は「未確認」と明記\n- 「未プレイ」と書かない\n- プレイしたような体験談を書かない\n- 「公式情報・ストア情報・公開レビュー傾向をもとに整理」という文言を本文に含める\n- 楽天アフィリエイトURLはnote本文のみに記載\n- X投稿文に楽天リンクを入れない`; 

  const userPrompt = `以下の情報を使って、note用Markdown記事とX投稿文3案を作成してください。\n
# 入力\n- game_name: ${context.gameName}\n- article_type: ${context.articleType}\n- note_url: ${safeNoteUrl}\n- 商品名: ${context.rakuten.title}\n- 発売日: ${context.rakuten.salesDate}\n- 価格: ${context.rakuten.itemPrice}\n- 商品URL: ${context.rakuten.itemUrl}\n- 楽天アフィリエイトURL: ${context.rakuten.affiliateUrl}\n- ハード: ${context.rakuten.hardware}\n- JAN: ${context.rakuten.jan}\n
# 記事要件\n- pre_release の場合は「予約前チェック記事」\n- post_release の場合は「評判まとめ記事」\n- 見出しに「似ている有名ゲーム」「買うべき人」「少し様子見でもいい人」を含める\n- note本文の最後に情報ソース箇条書きを入れる\n
# X投稿要件\n- 3パターン\n- 楽天リンクは禁止\n- note_url を含める（{note_url} と書かず、実際のURLまたは代替文字列を入れる）\n
次のJSONのみ返す:\n{\n  "note_markdown": "string",\n  "x_posts": ["string", "string", "string"]\n}`;

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      text: { format: { type: "json_object" } },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI APIエラー: ${res.status} ${res.statusText} ${text}`);
  }

  const data = await res.json();
  const outputText = extractOutputText(data);

  if (!outputText) {
    throw new Error("OpenAIレスポンスからテキストを取得できませんでした。");
  }

  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch (error) {
    throw new Error(`OpenAI出力(JSON)の解析失敗: ${error.message}`);
  }

  if (!parsed.note_markdown || !Array.isArray(parsed.x_posts) || parsed.x_posts.length !== 3) {
    throw new Error("OpenAI出力の形式が不正です。note_markdown と x_posts(3件) が必要です。");
  }

  return {
    noteMarkdown: parsed.note_markdown,
    xPosts: parsed.x_posts,
  };
}

async function main() {
  console.log(`ゲーム記事生成開始: ${gameName}`);

  const rakutenData = await fetchRakutenGame(gameName);
  if (!rakutenData.item) {
    throw new Error("楽天商品が見つかりませんでした。ゲーム名を正式タイトルに近づけて再実行してください。");
  }

  const articleType = resolveArticleType(requestedArticleType, rakutenData.item.salesDate);
  console.log(`記事タイプ確定: ${articleType}`);

  const generated = await generateByOpenAI({
    gameName,
    articleType,
    noteUrl,
    rakuten: rakutenData.item,
  });

  const datePart = formatYmdJst();
  const fileBase = `${datePart}-${sanitizeFileName(gameName)}`;
  const outputDir = path.join(process.cwd(), "outputs");

  await fs.mkdir(outputDir, { recursive: true });

  const notePath = path.join(outputDir, `${fileBase}-note.md`);
  const xPath = path.join(outputDir, `${fileBase}-x.txt`);
  const sourcesPath = path.join(outputDir, `${fileBase}-sources.json`);

  await fs.writeFile(notePath, `${generated.noteMarkdown}\n`, "utf8");
  await fs.writeFile(xPath, `${generated.xPosts.map((post, i) => `#${i + 1}\n${post}`).join("\n\n")}\n`, "utf8");
  await fs.writeFile(
    sourcesPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        gameName,
        requestedArticleType,
        resolvedArticleType: articleType,
        noteUrl: noteUrl || "（note公開後にURLを入れる）",
        rakuten: rakutenData.item,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(`生成完了:\n- ${notePath}\n- ${xPath}\n- ${sourcesPath}`);
}

main().catch((error) => {
  console.error("生成処理に失敗しました:");
  console.error(error);
  process.exit(1);
});
