import { pipeline } from "@xenova/transformers";
const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
export const embed = async (t: string) => Array.from((await extractor(t, { pooling: "mean", normalize: true })).data as Float32Array);