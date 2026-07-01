import { createHash } from 'node:crypto'
import { getCachedJson, setCachedJson } from './redisService.js'
import { logger } from '../utils/logger.js'

type DailyQuizCategory =
  | 'bollywood'
  | 'politics'
  | 'tech'
  | 'sports'
  | 'business'
  | 'world'
  | 'science'
  | 'india'
  | 'trend'
  | 'fallback'

export interface DailyQuizQuestion {
  id: string
  question: string
  options: string[]
  correctAnswer: string
  explanation: string
  topic: string
  category: DailyQuizCategory
}

export interface DailyQuizPayload {
  date: string
  region: 'IN'
  generatedAt: string
  source: 'live-rss' | 'fallback'
  cache: 'hit' | 'miss'
  topics: Array<{
    title: string
    source: string
    url?: string
    publishedAt?: string
    kind: string
    category: DailyQuizCategory
  }>
  questions: DailyQuizQuestion[]
  sourceStatus: Array<{ name: string; ok: boolean; count: number; error?: string }>
}

interface TopicInput {
  title: string
  source: string
  url?: string
  publishedAt?: string
  kind: 'trend' | 'news' | 'trend-news' | 'category-news' | 'fallback'
  category: DailyQuizCategory
}

interface SourceStatus {
  name: string
  ok: boolean
  count: number
  error?: string
}

const REGION = 'IN'
const TIME_ZONE = 'Asia/Kolkata'
const TRENDS_RSS = 'https://trends.google.com/trending/rss?geo=IN'
const NEWS_RSS = 'https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en'

const CATEGORY_FEEDS: Array<{ category: Exclude<DailyQuizCategory, 'trend' | 'fallback'>; label: string; query: string; target: number }> = [
  { category: 'bollywood', label: 'Bollywood & Entertainment', query: 'Bollywood OR Hindi cinema OR box office OR OTT India', target: 7 },
  { category: 'politics', label: 'Politics & Governance', query: 'India politics OR Parliament OR Supreme Court OR Election Commission', target: 7 },
  { category: 'tech', label: 'Tech, AI & Startups', query: 'India technology OR AI OR startups OR semiconductors OR cybersecurity', target: 7 },
  { category: 'sports', label: 'Sports & Cricket', query: 'India cricket OR IPL OR sports India OR Olympics India', target: 7 },
  { category: 'business', label: 'Business & Markets', query: 'India economy OR stock market OR RBI OR business India', target: 6 },
  { category: 'world', label: 'World Affairs', query: 'world news India OR geopolitics OR global summit OR international relations', target: 5 },
  { category: 'science', label: 'Science, Climate & Space', query: 'ISRO OR climate India OR science India OR space mission', target: 5 },
  { category: 'india', label: 'India Current Affairs', query: 'India policy OR education India OR weather alert India OR civic governance India', target: 7 },
]

const FALLBACK_CATEGORIES: Array<{ category: Exclude<DailyQuizCategory, 'trend'>; label: string; topics: string[] }> = [
  { category: 'bollywood', label: 'Bollywood & Entertainment', topics: ['new Bollywood box office race', 'OTT release buzz', 'film trailer reactions', 'celebrity interview controversy'] },
  { category: 'politics', label: 'Politics & Governance', topics: ['Parliament debate', 'state election strategy', 'Supreme Court hearing', 'major policy announcement'] },
  { category: 'tech', label: 'Tech, AI & Startups', topics: ['AI regulation in India', 'startup funding round', 'cybersecurity alert', 'semiconductor manufacturing push'] },
  { category: 'sports', label: 'Sports & Cricket', topics: ['India cricket squad update', 'IPL transfer buzz', 'Olympic medal hopeful', 'football league result'] },
  { category: 'business', label: 'Business & Markets', topics: ['RBI policy signal', 'stock market volatility', 'UPI transaction milestone', 'EV market expansion'] },
  { category: 'world', label: 'World Affairs', topics: ['global summit outcome', 'India foreign policy meeting', 'trade tension update', 'diaspora headline'] },
  { category: 'science', label: 'Science, Climate & Space', topics: ['ISRO mission update', 'monsoon forecast alert', 'renewable energy project', 'public health research'] },
  { category: 'india', label: 'India Current Affairs', topics: ['education reform update', 'city weather alert', 'digital governance rollout', 'public transport policy'] },
]

const GENERAL_DISTRACTORS = [
  'general lifestyle feature',
  'archive explainer',
  'culture throwback',
  'opinion column',
  'travel guide',
  'long-form weekend read',
]

function getIndiaDateKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function hash(input: string) {
  return createHash('sha256').update(input).digest('hex')
}

function seededNumber(input: string) {
  return Number.parseInt(hash(input).slice(0, 8), 16)
}

function seededShuffle<T>(items: T[], seedInput: string) {
  const out = items.slice()
  let seed = seededNumber(seedInput) || 1
  for (let i = out.length - 1; i > 0; i -= 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    const j = seed % (i + 1)
    const temp = out[i]
    out[i] = out[j] as T
    out[j] = temp as T
  }
  return out
}

function decodeXml(text: string) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_match, value: string) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/&#(\d+);/g, (_match, value: string) => String.fromCodePoint(Number.parseInt(value, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function cleanText(text: string) {
  return decodeXml(text)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function clipText(text: string, maxLength: number) {
  const cleaned = cleanText(text)
  if (cleaned.length <= maxLength) return cleaned
  const clipped = cleaned.slice(0, maxLength + 1)
  const boundary = clipped.search(/\s+\S*$/)
  return `${clipped.slice(0, boundary > 80 ? boundary : maxLength).trim()}...`
}

function googleNewsSearchUrl(query: string) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`
}

function readableForQuiz(title: string) {
  const cleaned = cleanText(title)
  if (cleaned.length < 18 || cleaned.length > 165) return false
  const latinLetters = cleaned.match(/[A-Za-z]/g)?.length ?? 0
  const indicLetters = cleaned.match(/[\u0900-\u097f]/g)?.length ?? 0
  if (latinLetters < 14) return false
  if (indicLetters > latinLetters) return false
  if (/^(photos|videos|live updates?|explained):?$/i.test(cleaned)) return false
  if (/^(monthly review|weekly current affairs|daily current affairs|current affairs quiz|latest current affairs)\b/i.test(cleaned)) return false
  if (/^(press note details|press release|notice|notification)\b/i.test(cleaned)) return false
  if (/\b(pdf download|answer key|admit card|syllabus|exam date|horoscope|lottery)\b/i.test(cleaned)) return false
  if (/\b(upsc|prelims|mains|ssc|neet|jee|mock test|exam prep|knowledge nugget)\b/i.test(cleaned)) return false
  if (/\bcror$/i.test(cleaned)) return false
  if (/horoscope|lottery|viral video|weather today/i.test(cleaned) && cleaned.length < 45) return false
  return true
}

function xmlTag(item: string, tagName: string) {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = item.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i'))
  return match?.[1] ? cleanText(match[1]) : ''
}

function extractItems(xml: string) {
  return Array.from(xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi))
    .map((match) => match[1])
    .filter((item): item is string => Boolean(item))
}

function splitGoogleNewsTitle(title: string) {
  const parts = title.split(' - ')
  if (parts.length < 2) return { headline: title, source: 'Google News India' }
  const source = parts.pop() ?? 'Google News India'
  return { headline: parts.join(' - '), source }
}

async function fetchText(url: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4500)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/rss+xml,text/xml,*/*',
        'User-Agent': 'AstraOS Daily Quiz/1.0',
      },
    })
    if (!response.ok) throw new Error(`Feed returned HTTP ${response.status}`)
    return response.text()
  } finally {
    clearTimeout(timeout)
  }
}

function normalizeTopic(topic: TopicInput) {
  return {
    ...topic,
    title: clipText(topic.title, 165),
    source: cleanText(topic.source || 'Public RSS').slice(0, 80),
    url: topic.url || undefined,
    publishedAt: topic.publishedAt || undefined,
  }
}

async function loadTrendTopics(): Promise<{ topics: TopicInput[]; status: SourceStatus }> {
  try {
    const xml = await fetchText(TRENDS_RSS)
    const topics: TopicInput[] = []
    for (const item of extractItems(xml).slice(0, 24)) {
      const title = xmlTag(item, 'title')
      const link = xmlTag(item, 'link')
      const pubDate = xmlTag(item, 'pubDate')
      if (title) {
        topics.push(normalizeTopic({
          title,
          source: 'Google Trends India',
          url: link,
          publishedAt: pubDate ? new Date(pubDate).toISOString() : undefined,
          kind: 'trend',
          category: 'trend',
        }))
      }

      const relatedTitle = xmlTag(item, 'ht:news_item_title')
      const relatedSource = xmlTag(item, 'ht:news_item_source')
      const relatedUrl = xmlTag(item, 'ht:news_item_url')
      if (relatedTitle) {
        topics.push(normalizeTopic({
          title: relatedTitle,
          source: relatedSource || 'Google Trends India',
          url: relatedUrl || link,
          publishedAt: pubDate ? new Date(pubDate).toISOString() : undefined,
          kind: 'trend-news',
          category: 'trend',
        }))
      }
    }
    return { topics, status: { name: 'google-trends-rss-in', ok: true, count: topics.length } }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google Trends RSS failed'
    logger.warn('Daily quiz Trends feed failed', { error: message })
    return { topics: [], status: { name: 'google-trends-rss-in', ok: false, count: 0, error: message } }
  }
}

async function loadNewsTopics(): Promise<{ topics: TopicInput[]; status: SourceStatus }> {
  try {
    const xml = await fetchText(NEWS_RSS)
    const topics = extractItems(xml).slice(0, 32).map((item) => {
      const rawTitle = xmlTag(item, 'title')
      const link = xmlTag(item, 'link')
      const pubDate = xmlTag(item, 'pubDate')
      const parsed = splitGoogleNewsTitle(rawTitle)
      return normalizeTopic({
        title: parsed.headline,
        source: parsed.source,
        url: link,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : undefined,
        kind: 'news',
        category: 'india',
      })
    }).filter((topic) => topic.title && readableForQuiz(topic.title))
    return { topics, status: { name: 'google-news-rss-in', ok: true, count: topics.length } }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google News RSS failed'
    logger.warn('Daily quiz News feed failed', { error: message })
    return { topics: [], status: { name: 'google-news-rss-in', ok: false, count: 0, error: message } }
  }
}

async function loadCategoryTopics(feed: (typeof CATEGORY_FEEDS)[number]): Promise<{ topics: TopicInput[]; status: SourceStatus }> {
  try {
    const xml = await fetchText(googleNewsSearchUrl(feed.query))
    const topics = extractItems(xml).slice(0, 18).map((item) => {
      const rawTitle = xmlTag(item, 'title')
      const link = xmlTag(item, 'link')
      const pubDate = xmlTag(item, 'pubDate')
      const parsed = splitGoogleNewsTitle(rawTitle)
      return normalizeTopic({
        title: parsed.headline,
        source: parsed.source,
        url: link,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : undefined,
        kind: 'category-news',
        category: feed.category,
      })
    }).filter((topic) => topic.title && readableForQuiz(topic.title)).slice(0, feed.target)
    return { topics, status: { name: `google-news-${feed.category}`, ok: true, count: topics.length } }
  } catch (error) {
    const message = error instanceof Error ? error.message : `${feed.label} RSS failed`
    logger.warn('Daily quiz category feed failed', { category: feed.category, error: message })
    return { topics: [], status: { name: `google-news-${feed.category}`, ok: false, count: 0, error: message } }
  }
}

function dedupeTopics(topics: TopicInput[]) {
  const seen = new Set<string>()
  const out: TopicInput[] = []
  for (const topic of topics) {
    const key = topic.title.toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/gi, ' ').trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(topic)
  }
  return out
}

function buildFallbackTopics(date: string) {
  return FALLBACK_CATEGORIES.flatMap((group) => seededShuffle(group.topics, `fallback:${date}:${group.category}`).map((title) => normalizeTopic({
    title,
    source: `AstraOS ${group.label} fallback`,
    kind: 'fallback',
    category: group.category,
    publishedAt: `${date}T00:00:00.000+05:30`,
    url: undefined,
  })))
}

function optionSet(correct: string, candidates: string[], seed: string) {
  const normalizedCorrect = cleanText(correct)
  const unique = [normalizedCorrect]
  for (const candidate of candidates) {
    const value = cleanText(candidate)
    if (!value || value.toLowerCase() === normalizedCorrect.toLowerCase()) continue
    if (unique.some((item) => item.toLowerCase() === value.toLowerCase())) continue
    unique.push(value)
    if (unique.length === 4) break
  }
  for (const fallback of GENERAL_DISTRACTORS) {
    if (unique.length === 4) break
    if (!unique.some((item) => item.toLowerCase() === fallback.toLowerCase())) unique.push(fallback)
  }
  return seededShuffle(unique.slice(0, 4), seed)
}

function makeQuestion(
  date: string,
  category: DailyQuizQuestion['category'],
  prompt: string,
  correctAnswer: string,
  candidates: string[],
  topic: string,
  explanation: string,
) {
  const id = hash(`${date}:${category}:${prompt}:${correctAnswer}`).slice(0, 16)
  return {
    id,
    question: prompt,
    options: optionSet(correctAnswer, candidates, id),
    correctAnswer,
    explanation,
    topic,
    category,
  }
}

function categoryLabel(category: DailyQuizCategory) {
  return CATEGORY_FEEDS.find((feed) => feed.category === category)?.label
    ?? FALLBACK_CATEGORIES.find((feed) => feed.category === category)?.label
    ?? (category === 'trend' ? 'Trending Radar' : 'Current Affairs')
}

function categoryPrompt(category: DailyQuizCategory, variant: number) {
  const label = categoryLabel(category)
  const prompts: Record<DailyQuizCategory, string[]> = {
    bollywood: [
      `Bollywood radar: which story is in today's entertainment pulse?`,
      `Which film/OTT headline belongs to today's Bollywood watchlist?`,
      `Entertainment heat-check: which update is part of today's India feed?`,
    ],
    politics: [
      `Politics & governance: which development is in today's India feed?`,
      `Which public-affairs headline belongs to today's governance radar?`,
      `Current affairs drill: which political story should you track today?`,
    ],
    tech: [
      `Tech, AI & startups: which update is in today's India pulse?`,
      `Which technology headline belongs to today's innovation radar?`,
      `Startup/AI watch: which story is part of today's feed?`,
    ],
    sports: [
      `Sports & cricket: which update is in today's India sports pulse?`,
      `Which cricket/sports headline belongs to today's radar?`,
      `Match-day awareness: which sports story is part of today's feed?`,
    ],
    business: [
      `Business & markets: which update is in today's economy pulse?`,
      `Which market/business headline belongs to today's India radar?`,
      `Finance awareness: which story is part of today's feed?`,
    ],
    world: [
      `World affairs: which global story is in today's India-facing pulse?`,
      `Which international headline belongs to today's current-affairs radar?`,
      `Global awareness check: which story is part of today's feed?`,
    ],
    science: [
      `Science, climate & space: which update is in today's knowledge pulse?`,
      `Which climate/space/science headline belongs to today's radar?`,
      `Future watch: which science story is part of today's feed?`,
    ],
    india: [
      `India current affairs: which headline is in today's national pulse?`,
      `Which India update belongs to today's daily awareness set?`,
      `Daily India drill: which story is part of today's feed?`,
    ],
    trend: [
      `Trending radar: which search topic is hot in India today?`,
      `Which trend is part of today's India buzz?`,
      `Live trend check: which topic appears in today's feed?`,
    ],
    fallback: [
      `Daily fallback: which current-affairs focus is in today's set?`,
      `Offline current-affairs drill: which topic is in today's practice set?`,
      `AstraOS fallback radar: which topic should you revise today?`,
    ],
  }
  const choices = prompts[category] ?? [`${label}: which story is in today's pulse?`]
  return choices[variant % choices.length] as string
}

function selectCandidates(correct: TopicInput, pool: TopicInput[], allTopics: TopicInput[]) {
  const sameCategory = pool
    .filter((topic) => topic.title !== correct.title)
    .map((topic) => topic.title)
  const allReadable = allTopics
    .filter((topic) => topic.title !== correct.title)
    .map((topic) => topic.title)
  return sameCategory.concat(allReadable)
}

function buildQuestions(date: string, topics: TopicInput[]) {
  const cleanTopics = dedupeTopics(topics)
    .filter((topic) => topic.kind === 'fallback' || topic.category === 'trend' || readableForQuiz(topic.title))
    .slice(0, 80)
  const grouped = new Map<DailyQuizCategory, TopicInput[]>()
  for (const topic of cleanTopics) {
    const list = grouped.get(topic.category) ?? []
    list.push(topic)
    grouped.set(topic.category, list)
  }

  const categoryOrder: DailyQuizCategory[] = ['bollywood', 'politics', 'tech', 'sports', 'business', 'world', 'science', 'india', 'fallback']
  const questionsByCategory = new Map<DailyQuizCategory, DailyQuizQuestion[]>()

  for (const category of categoryOrder) {
    const pool = grouped.get(category) ?? []
    if (!pool.length) continue
    const categoryQuestions: DailyQuizQuestion[] = []
    const shuffledPool = seededShuffle(pool, `pool:${date}:${category}`).slice(0, Math.min(pool.length, 8))

    shuffledPool.forEach((topic, index) => {
      categoryQuestions.push(makeQuestion(
        date,
        category,
        categoryPrompt(category, index),
        topic.title,
        selectCandidates(topic, pool, cleanTopics),
        topic.title,
        `${categoryLabel(category)} item from ${topic.source} for ${date}.`,
      ))
    })

    questionsByCategory.set(category, dedupeQuestions(categoryQuestions))
  }

  const interleaved: DailyQuizQuestion[] = []
  for (let round = 0; round < 8; round += 1) {
    for (const category of categoryOrder) {
      const categoryQuestions = questionsByCategory.get(category) ?? []
      const question = categoryQuestions[round]
      if (question) interleaved.push(question)
    }
  }

  return dedupeQuestions(interleaved).slice(0, 64)
}

function dedupeQuestions(questions: DailyQuizQuestion[]) {
  const seen = new Set<string>()
  const out: DailyQuizQuestion[] = []
  for (const question of questions) {
    const key = `${question.question}:${question.correctAnswer}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(question)
  }
  return out
}

async function buildDailyQuiz(date: string): Promise<Omit<DailyQuizPayload, 'cache'>> {
  const [trends, news, ...categoryResults] = await Promise.all([
    loadTrendTopics(),
    loadNewsTopics(),
    ...CATEGORY_FEEDS.map((feed) => loadCategoryTopics(feed)),
  ])
  const liveTopics = dedupeTopics([
    ...categoryResults.flatMap((result) => result.topics),
    ...news.topics.slice(0, 12),
    ...trends.topics.filter((topic) => readableForQuiz(topic.title)).slice(0, 10),
  ])
  let topics = liveTopics.slice()
  let source: DailyQuizPayload['source'] = 'live-rss'

  if (topics.length < 10) {
    source = 'fallback'
    topics = buildFallbackTopics(date)
  } else {
    const categoryCounts = new Map<DailyQuizCategory, number>()
    for (const topic of topics) {
      categoryCounts.set(topic.category, (categoryCounts.get(topic.category) ?? 0) + 1)
    }
    const fallbackFill = buildFallbackTopics(date).filter((topic) => {
      const current = categoryCounts.get(topic.category) ?? 0
      if (current >= 3) return false
      categoryCounts.set(topic.category, current + 1)
      return true
    })
    topics = dedupeTopics(topics.concat(fallbackFill))
  }

  return {
    date,
    region: REGION,
    generatedAt: new Date().toISOString(),
    source,
    topics: topics.slice(0, 30).map((topic) => ({
      title: topic.title,
      source: topic.source,
      url: topic.url,
      publishedAt: topic.publishedAt,
      kind: topic.kind,
      category: topic.category,
    })),
    questions: buildQuestions(date, topics),
    sourceStatus: [trends.status, news.status, ...categoryResults.map((result) => result.status)],
  }
}

export async function getDailyQuiz(region = REGION): Promise<DailyQuizPayload> {
  if (region.toUpperCase() !== REGION) {
    region = REGION
  }

  const date = getIndiaDateKey()
  const key = `quiz:daily:v5:${REGION}:${date}`
  const existing = await getCachedJson<Omit<DailyQuizPayload, 'cache'>>(key)
  if (existing) return { ...existing, cache: 'hit' }

  const payload = await buildDailyQuiz(date)
  await setCachedJson(key, payload, payload.source === 'fallback' ? 600 : 26 * 60 * 60)
  return { ...payload, cache: 'miss' }
}
