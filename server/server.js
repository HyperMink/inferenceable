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

import fs from 'fs';
import cluster from 'cluster';
import https from 'https';
import http from 'http';
import pino from 'pino';
import config from '../config.js'
import app from './express-server.js';

const logger = pino();

export default function startCluster() {
  if (cluster.isMaster) {
    logger.info(`Master ${process.pid} is running`);
    for (let i = 0; i < config.maxHttpWorkers; i++) {
      cluster.fork();
    }
    cluster.on('exit', (worker, code, signal) => {
      logger.info(`Worker ${worker.process.pid} died`);
    });
  } else {
    if (config.sslPrivateKeyPath && config.sslCertificatePath) {
      try {
        const sslOptions = {key: fs.readFileSync(config.sslPrivateKeyPath), cert: fs.readFileSync(config.sslCertificatePath)};
        logger.info('Using SSL')
        logger.info(`Express worker ~ ${process.pid} listening on port ${config.httpsPort}`);
        https.createServer(sslOptions, app).listen(config.httpsPort);
      } catch (err) {
        logger.error(err);
        // Meant to be secured, do not continue
        process.exit(1);
      }
    } else {
      logger.info(`Express worker ~ ${process.pid} listening on port ${config.httpPort}`);
      http.createServer(app).listen(config.httpPort);
    }
  }
}
