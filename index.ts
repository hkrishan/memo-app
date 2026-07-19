// Performance instrumentation - mark startup as early as possible
import { perf } from "@/lib/performance";
perf.markStartup();

// Use expo-router as the app entry so navigation is driven from /src/app.
import "expo-router/entry";
