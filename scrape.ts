import fetch from "node-fetch";
import * as dateformat from "dateformat";
import { performance } from "perf_hooks";
import * as fs from "fs";

// https://github.com/HackerNews/API

const sampleDistanceSeconds = 60;
const maxRank = 90;

const fileprefix = `out/newstories_${dateformat("yyyy-mm-dd_HH-MM-ss")}`;
const dataStream = fs.createWriteStream(`${fileprefix}.tsv`, { flags: "a" });
const logStream = fs.createWriteStream(`${fileprefix}.log`, { flags: "a" });

const storyEndpoints = ["top", "new", "best", "ask", "show", "job"];

let tick = 0;
async function main() {
  printerr(`writing to: ${fileprefix}.tsv`);
  printerr(`SampleDistance: ${sampleDistanceSeconds}s`);
  printerr(`Follow stories maxRank: ${maxRank}`);
  printerr("Starting Scraper...");
  printHeader();
  update();
  setInterval(update, 1000 * sampleDistanceSeconds);
}

interface ApiItem {
  by: string;
  descendants: number;
  id: number;
  kids?: Array<number>;
  score: number;
  time: number;
  title: string;
  type: "story";
  url?: string;
}

interface Sample {
  id: number;
  score: number;
  descendants: number;
  submission_time: number;
  sample_time: number;
  tick: number;
  topRank?: number;
  newRank?: number;
  bestRank?: number;
  askRank?: number;
  showRank?: number;
  jobRank?: number;
}

function printHeader() {
  println(
    [
      "id",
      "score",
      "descendants",
      "submission_time",
      "sample_time",
      "tick",
      ...storyEndpoints.map((e) => `${e}Rank`),
    ].join("\t")
  );
}

function printSample(s: Sample) {
  println(
    [
      s.id,
      s.score,
      s.descendants,
      s.submission_time,
      s.sample_time,
      s.tick,
      s.topRank || "\\N",
      s.newRank || "\\N",
      s.bestRank || "\\N",
      s.askRank || "\\N",
      s.showRank || "\\N",
      s.jobRank || "\\N",
    ].join("\t")
  );
}

async function getSample(
  tick: number,
  itemId: number,
  rankMaps: Array<{ endpoint: string; rankMap: Map<number, number> }>
): Promise<Sample> {
  const item = await getItem(itemId);
  if (item == null) throw Error(`Could not get item: ${itemId}`);
  const ranks = {};
  rankMaps.forEach(
    ({ endpoint, rankMap }) => (ranks[`${endpoint}Rank`] = rankMap.get(itemId))
  );
  return {
    id: item.id,
    score: item.score,
    ...ranks,
    descendants: item.descendants,
    submission_time: item.time,
    sample_time: currentTimestamp(),
    tick: tick,
  };
}

async function update() {
  try {
    const startTime = performance.now();
    const rankMaps: Array<{
      endpoint: string;
      rankMap: Map<number, number>;
    }> = await Promise.all(
      storyEndpoints.map((endpoint) =>
        getIdsFromStoryEndpoint(endpoint).then((ids) => ({
          endpoint,
          rankMap: getRankMap(ids, maxRank),
        }))
      )
    );
    const itemIds: Array<number> = Array.from(
      new Set(rankMaps.flatMap(({ rankMap }) => Array.from(rankMap.keys())))
    );
    Promise.all(
      itemIds.map(async (itemId) => {
        try {
          printSample(await getSample(tick, itemId, rankMaps));
        } catch (error) {
          printerr(error);
        }
      })
    );
    printerr(
      `${tick}: Updated ${itemIds.length} stories in ${Math.round(
        performance.now() - startTime
      )}ms`
    );
  } catch (error) {
    printerr(error);
  }
  tick += 1;
}

async function getIdsFromStoryEndpoint(
  endpoint: string
): Promise<Array<number>> {
  return (await (
    await fetch(`https://hacker-news.firebaseio.com/v0/${endpoint}stories.json`)
  ).json()) as Array<number>;
}

function getRankMap(ids: Array<number>, maxRank: number): Map<number, number> {
  const map = new Map<number, number>();
  ids.slice(0, maxRank).forEach((id, index) => {
    const rank = index + 1;
    map.set(id, rank);
  });
  return map;
}

async function getItem(itemId: number): Promise<ApiItem> {
  return (await (
    await fetch(`https://hacker-news.firebaseio.com/v0/item/${itemId}.json`)
  ).json()) as ApiItem;
}

function currentTimestamp(): number {
  return Math.round(new Date().getTime() / 1000);
}

function println(str: string) {
  dataStream.write(str + "\n");
}

function printerr(str: string) {
  const timestamp = dateformat("yyyy-mm-dd HH:MM:ss");
  logStream.write(`[${timestamp}] ${str}\n`);
  process.stderr.write(`[${timestamp}] ${str}\n`);
}

main();
