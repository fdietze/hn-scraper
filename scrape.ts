import fetch from "node-fetch";
import * as dateformat from "dateformat";
import { performance } from "perf_hooks";

const sampleDistanceSeconds = 60;
const maxAgeHours = 48;

const watchingStories = new Set<number>();

async function main() {
  printerr(`SampleDistance: ${sampleDistanceSeconds}s`);
  printerr(`Follow stories: ${maxAgeHours}h`);
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
  rank?: number;
  descendants: number;
  submission_time: number;
  sample_time: number;
}

function printHeader() {
  println(
    [
      "id",
      "score",
      "rank",
      "descendants",
      "submission_time",
      "sample_time",
    ].join("\t")
  );
}

function printSample(s: Sample) {
  println(
    [
      s.id,
      s.score,
      s.rank || "\\N",
      s.descendants,
      s.submission_time,
      s.sample_time,
    ].join("\t")
  );
}

async function getSample(
  itemId: number,
  rankMap: Map<number, number>
): Promise<Sample> {
  const item = await getItem(itemId);
  return {
    id: item.id,
    score: item.score,
    rank: rankMap.get(itemId),
    descendants: item.descendants,
    submission_time: item.time,
    sample_time: currentTimestamp(),
  };
}

async function update() {
  try {
    const startTime = performance.now();
    const [newIds, rankMap] = await Promise.all([getNewIds(), getRankMap()]);
    newIds.forEach((itemId) => watchingStories.add(itemId));
    await Promise.all(
      Array.from(watchingStories).map(async (itemId) => {
        const sample = await getSample(itemId, rankMap);
        const ageHours = (sample.sample_time - sample.submission_time) / 3600;
        if (ageHours <= maxAgeHours) {
          printSample(sample);
        } else {
          watchingStories.delete(itemId);
        }
      })
    );
    printerr(
      `Updated ${watchingStories.size} stories in ${Math.round(
        performance.now() - startTime
      )}ms`
    );
  } catch (error) {
    printerr(error);
  }
}

async function getNewIds(): Promise<Array<number>> {
  return (await (
    await fetch("https://hacker-news.firebaseio.com/v0/newstories.json")
  ).json()) as Array<number>;
}

async function getTopIds(): Promise<Array<number>> {
  return (await (
    await fetch("https://hacker-news.firebaseio.com/v0/topstories.json")
  ).json()) as Array<number>;
}

async function getRankMap(): Promise<Map<number, number>> {
  const top = await getTopIds();
  const map = new Map<number, number>();
  top.forEach((id, index) => {
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
  process.stdout.write(str + "\n");
}

function printerr(str: string) {
  const timestamp = dateformat("yyyy-mm-dd HH:MM:ss");
  process.stderr.write(`[${timestamp}] ${str}\n`);
}

main();
