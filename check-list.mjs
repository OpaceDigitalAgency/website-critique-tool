import { getStore } from "@netlify/blobs";

const projectsStore = getStore({
  name: "projects",
  siteID: "355c7c56-9205-43f4-87a5-0294233016ed",
  token: "nfp_cAeX57LtHYvjjErkwFRaRXMmEKkMQb8Va1a9"
});

console.log("=== PROJECTS LIST ===");
const list = await projectsStore.get("_list", { type: "json" });
console.log(JSON.stringify(list, null, 2));

