import type { ProfileActivityResult } from "./types";

const OPERATION_NAMES = ["UserByScreenName", "UserTweets", "UserTweetsAndReplies"] as const;

type OperationName = (typeof OPERATION_NAMES)[number];

export interface XApiAuthContext {
  csrfToken: string;
  bearerToken: string;
}

interface GraphQLOperation {
  name: OperationName;
  queryId: string;
}

interface UserLookup {
  username: string;
  restId: string;
}

interface TimelineEntry {
  createdAt: string | null;
  pinned: boolean;
}

type GraphQLData = Record<string, unknown>;

const operationCache = new Map<OperationName, GraphQLOperation>();
let bearerTokenCache: string | null = null;
let bearerTokenDiscoveryDone = false;
let operationDiscoveryDone = false;

function cleanText(value?: string | null) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function cookieValue(name: string) {
  const prefix = `${name}=`;
  return (
    document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length) || ""
  );
}

function findBearerTokenInSource(source: string) {
  const match = source.match(/AAAAAAAAAAAAAAAAAAAAA[A-Za-z0-9%_-]{80,}/);
  return match?.[0] || null;
}

async function discoverBearerToken() {
  if (bearerTokenCache) return bearerTokenCache;
  if (bearerTokenDiscoveryDone) return null;

  for (const url of currentScriptUrls()) {
    try {
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) continue;
      const source = await response.text();
      const token = findBearerTokenInSource(source);
      if (token) {
        bearerTokenCache = token;
        bearerTokenDiscoveryDone = true;
        return token;
      }
    } catch {
      continue;
    }
  }

  bearerTokenDiscoveryDone = true;
  return null;
}

export async function getXApiAuthContext(): Promise<XApiAuthContext | null> {
  const csrfToken = cookieValue("ct0");
  if (!csrfToken) return null;
  const bearerToken = await discoverBearerToken();
  if (!bearerToken) return null;

  return {
    csrfToken,
    bearerToken
  };
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function currentScriptUrls() {
  const fromDom = Array.from(document.querySelectorAll<HTMLScriptElement>('script[src*="/responsive-web/client-web/"]')).map(
    (script) => script.src
  );
  const fromPerformance = performance
    .getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter((name) => name.includes("/responsive-web/client-web/") && name.endsWith(".js"));

  return unique([...fromDom, ...fromPerformance]).slice(-80);
}

function findOperationInSource(source: string, name: OperationName): GraphQLOperation | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`operationName["']?\\s*[:=]\\s*["']${escapedName}["'][\\s\\S]{0,500}?queryId["']?\\s*[:=]\\s*["']([^"']+)["']`),
    new RegExp(`queryId["']?\\s*[:=]\\s*["']([^"']+)["'][\\s\\S]{0,500}?operationName["']?\\s*[:=]\\s*["']${escapedName}["']`),
    new RegExp(`["']${escapedName}["']\\s*,\\s*queryId\\s*[:=]\\s*["']([^"']+)["']`),
    new RegExp(`["']${escapedName}["'][\\s\\S]{0,220}?["']queryId["']\\s*:\\s*["']([^"']+)["']`)
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) return { name, queryId: match[1] };
  }

  return null;
}

async function discoverOperations() {
  const missing = OPERATION_NAMES.filter((name) => !operationCache.has(name));
  if (missing.length === 0) return;
  if (operationDiscoveryDone) return;

  const urls = currentScriptUrls();
  for (const url of urls) {
    if (missing.every((name) => operationCache.has(name))) return;

    let source = "";
    try {
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) continue;
      source = await response.text();
    } catch {
      continue;
    }

    for (const name of missing) {
      if (operationCache.has(name)) continue;
      const operation = findOperationInSource(source, name);
      if (operation) operationCache.set(name, operation);
    }
  }

  operationDiscoveryDone = true;
}

function graphQLUrl(operation: GraphQLOperation, variables: unknown, features: unknown) {
  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    features: JSON.stringify(features)
  });

  return `https://x.com/i/api/graphql/${operation.queryId}/${operation.name}?${params.toString()}`;
}

async function fetchGraphQL(auth: XApiAuthContext, operation: GraphQLOperation, variables: unknown, features: unknown) {
  const response = await fetch(graphQLUrl(operation, variables, features), {
    credentials: "include",
    headers: {
      authorization: `Bearer ${auth.bearerToken}`,
      "content-type": "application/json",
      "x-csrf-token": auth.csrfToken,
      "x-twitter-active-user": "yes",
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-client-language": navigator.language?.split("-")[0] || "en"
    }
  });

  if (response.status === 429) {
    throw new Error("X API rate limited this session.");
  }

  if (!response.ok) {
    throw new Error(`X API returned ${response.status}.`);
  }

  return (await response.json()) as GraphQLData;
}

function firstStringByKey(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate) return candidate;
  }

  for (const child of Object.values(record)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = firstStringByKey(item, keys);
        if (found) return found;
      }
      continue;
    }

    const found = firstStringByKey(child, keys);
    if (found) return found;
  }

  return null;
}

function collectTimelineEntries(value: unknown, out: TimelineEntry[] = []): TimelineEntry[] {
  if (!value || typeof value !== "object") return out;

  const record = value as Record<string, unknown>;
  const legacy = record.legacy as Record<string, unknown> | undefined;
  const createdAt = typeof legacy?.created_at === "string" ? legacy.created_at : null;
  if (createdAt) {
    const text = cleanText(JSON.stringify(record)).toLowerCase();
    out.push({ createdAt, pinned: text.includes("pinned") || text.includes("promoted") });
  }

  for (const child of Object.values(record)) {
    if (Array.isArray(child)) {
      for (const item of child) collectTimelineEntries(item, out);
    } else {
      collectTimelineEntries(child, out);
    }
  }

  return out;
}

function parseTwitterDate(value: string) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function userLookupVariables(username: string) {
  return {
    screen_name: username,
    withSafetyModeUserFields: true
  };
}

const userFeatures = {
  hidden_profile_likes_enabled: true,
  hidden_profile_subscriptions_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  subscriptions_verification_info_is_identity_verified_enabled: true,
  subscriptions_verification_info_verified_since_enabled: true,
  highlights_tweets_tab_ui_enabled: true,
  responsive_web_twitter_article_notes_tab_enabled: true,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true
};

const timelineFeatures = {
  rweb_video_screen_enabled: false,
  payments_enabled: false,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  rweb_tipjar_consumption_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: false,
  responsive_web_jetfuel_frame: false,
  responsive_web_grok_share_attachment_enabled: false,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  responsive_web_grok_show_grok_translated_post: false,
  responsive_web_grok_analysis_button_from_backend: false,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_enhance_cards_enabled: false
};

function timelineVariables(restId: string) {
  return {
    userId: restId,
    count: 5,
    includePromotedContent: false,
    withQuickPromoteEligibilityTweetFields: false,
    withVoice: false,
    withV2Timeline: true
  };
}

async function lookupUser(auth: XApiAuthContext, username: string): Promise<UserLookup | null> {
  const operation = operationCache.get("UserByScreenName");
  if (!operation) return null;

  const data = await fetchGraphQL(auth, operation, userLookupVariables(username), userFeatures);
  const restId = firstStringByKey(data, ["rest_id", "id_str"]);
  if (!restId) return null;

  return { username, restId };
}

async function fetchTimeline(auth: XApiAuthContext, restId: string) {
  const operation = operationCache.get("UserTweets") ?? operationCache.get("UserTweetsAndReplies");
  if (!operation) return [];

  const data = await fetchGraphQL(auth, operation, timelineVariables(restId), timelineFeatures);
  return collectTimelineEntries(data);
}

export async function resolveProfileActivityViaXApi(username: string): Promise<ProfileActivityResult | null> {
  const auth = await getXApiAuthContext();
  if (!auth) return null;

  await discoverOperations();

  const lookup = await lookupUser(auth, username);
  if (!lookup) return null;

  const entries = await fetchTimeline(auth, lookup.restId);
  const latest = entries.find((entry) => !entry.pinned) ?? entries[0] ?? null;
  const lastActivityISO = latest?.createdAt ? parseTwitterDate(latest.createdAt) : null;

  if (lastActivityISO) {
    return {
      username,
      lastActivityISO,
      activitySource: "apiTimeline",
      profileState: "posts",
      note: "Resolved through X web API fast path."
    };
  }

  return {
    username,
    lastActivityISO: null,
    activitySource: "none",
    profileState: "unknown",
    note: "X web API fast path returned no timeline activity."
  };
}

export async function isXApiFastPathAvailable() {
  const auth = await getXApiAuthContext();
  if (!auth) return false;

  await discoverOperations();
  return Boolean(operationCache.get("UserByScreenName") && (operationCache.get("UserTweets") || operationCache.get("UserTweetsAndReplies")));
}
