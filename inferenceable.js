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

import * as fs from 'fs';
import pino from 'pino';
import EasyDl from 'easydl';
import config from './config.js'
import startCluster from './server/server.js'

const logger = pino();

/****************************************************************************
  Sanity check & start server
****************************************************************************/

// Ensure the models defined in models config exists
for (const modelObj of config.modelsConfig) {
  await ensureExists(modelObj.model_origin, modelObj.model_path);
  if (modelObj.mmproj_path) {
    await ensureExists(modelObj.mmproj_origin, modelObj.mmproj_path);
  }
}

logger.info('It\'s Inferenceable (ツ)');
startCluster();

async function ensureExists(source, destination) {
  if (!fs.existsSync(destination)) {
    logger.info(`Required model not found, preparing to download ${destination}`)
    const success = await downloadFile(source, destination);
    if (!success) {
      logger.error('Sanity check failed!');
      logger.error(`Failed to download required dependency ${destination}`);
      process.exit(1);
    }
  }
}

function mkPath(path) {
  try {
    if (!fs.existsSync(path)) {
      fs.mkdirSync(path, { recursive: true });
    }
  } catch (err) {
    logger.error(`Failed to create path: ${path}`);
  }
}

async function downloadFile(source, destination) {
  let success = false;
  try {
    logger.info(`Download source ${source}`)
    const destParent = destination.substring(0, destination.lastIndexOf('/'));
    mkPath(destParent) // make sure the parent exists
    const downloader = new EasyDl(source, destination, {existBehavior: 'overwrite'})
    const downloaded = await downloader.on("progress", ({ details, total }) => {
      const percentDownloaded = Math.floor(total.percentage);
      if (percentDownloaded < 100)
        process.stdout.write(`\r  ⇣ Downloading ${percentDownloaded}% ⇣`);
      else
        process.stdout.write(`\r  ~~ Stitching downloaded chunks ~~`);
    }).wait()
    if (downloaded) {
      logger.info(`Successfully downloaded ${destination}`);
      success = true;
    } else {
      logger.info(`Download interrupted ${destination}`);
    }
  } catch (err) {
    logger.error(`Download failed ${destination}`);
    logger.error(err);
  } finally {
    return success;
  }
}
