import { seedDemoModules } from "@workspace/db";

seedDemoModules()
  .then((r) => {
    console.log("DONE", JSON.stringify(r));
    process.exit(0);
  })
  .catch((e) => {
    console.error("ERR", e instanceof Error ? e.message : e);
    console.error(e instanceof Error ? e.stack : "");
    process.exit(1);
  });
