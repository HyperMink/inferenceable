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

import express from 'express';
import pino from 'pino';
import config from '../config.js';
import apiRoutes from './routers/api-routes.js';
import authNone from './security/auth/none.js';

const logger = pino();
const expressApp = express();
expressApp.use(express.json({ limit: '20mb' }));
expressApp.set('json spaces', 2);

let CSP = null;
try {
  CSP = await import(`${config.CSP}`);
  CSP = CSP.default;
} catch (err) {
  logger.error(err);
  // Failed to load the required content security policy
  process.exit(1);
}

let auth = authNone;
if (config.authStrategy) {
  try {
    auth = await import(`${config.authStrategy}`);
    auth = auth.default;
  } catch (err) {
    logger.error(err);
    // Auth strategy is defined but failed to load, abort
    process.exit(1);
  }
}

let rateLimiter = null;
if (config.rateLimiter) {
  try {
    rateLimiter = await import(`${config.rateLimiter}`);
    rateLimiter = rateLimiter.default;
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

const UI_CACHE_TTL = 1000 * 3600; // millis, 1 hour
expressApp.use(auth);
expressApp.use('/api', rateLimiter.api, CSP.api, auth.api, apiRoutes);
expressApp.use('/', rateLimiter.root, CSP.root, auth.root, express.static(config.uiPath, { maxAge: UI_CACHE_TTL }));

export default expressApp;
