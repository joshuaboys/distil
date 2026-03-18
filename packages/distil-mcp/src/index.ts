#!/usr/bin/env node
import { createServer } from "./server.js";

const { start } = createServer();
await start();
