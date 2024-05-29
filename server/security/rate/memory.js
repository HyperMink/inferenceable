/*
 * The Apache License, Version 2.0
 *
 * Copyright 2024 Inferenceable, HyperMink
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { RateLimiterMemory } from "rate-limiter-flexible";

/*
 * Note: in-memory limit is per http worker which is not evenly distributed.
 * Use Redis or Mongo rate limiter for production use. eg. https://github.com/animir/node-rate-limiter-flexible/wiki/Redis
 */

// Max 10 points(requests) / 10 seconds / IP
const opts = {
  points: 10,
  duration: 10,
};
const inMemoryLimiter = new RateLimiterMemory(opts);

class LIMITER {

  // No limits on '/', static files etc
  static root = (req, res, next) => {
    next();
  };

  // Rate limit '/api'
  static api = (req, res, next) => {
    inMemoryLimiter.consume(req.ip)
      .then(() => {
        next();
      })
      .catch(() => {
        res.status(429).send('Too Many Requests');
      });
  };
}

export default LIMITER;
