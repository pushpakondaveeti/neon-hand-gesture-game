import serverless from "serverless-http";
import app from "../../backend/server.js";

// Wrap express app with serverless-http to run on Netlify Functions
export const handler = serverless(app);
