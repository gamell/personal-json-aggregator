import { handler } from './index.js';

type Callback = (error: Error | string | null, result?: string) => void;

const context = process.argv[2] || "";
console.log(`Running with context: ${context}`);

const callback: Callback = (err, success) => {
  if (success) {
    console.log(success);
    process.exit(0);
  }
  if (err) {
    console.error(err);
    process.exit(1);
  }
};

handler("test-event", context, callback);
