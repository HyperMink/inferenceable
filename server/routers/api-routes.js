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

import path from 'path';
import fs from 'fs';
import express from 'express';
import pino from 'pino';
import crypto from 'crypto';
import { exec } from 'child_process';
import config from '../../config.js'

const logger = pino();
const router = express.Router();

const ROUTER = '/api'
const endPoints = {infer: '/infer', embedding: '/embedding'};
config.api['capabilities'] = {
  text: config.defaultTextModel ? true : false,
  vision: config.defaultVisionModel ? true : false
}
config.api['endpoints'] = {infer: `${ROUTER}/infer`, embedding: `${ROUTER}/embedding`};

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.get('/', [hello], (req, res, next) => {});
router.post(endPoints.infer, [infer], (req, res, next) => {});
router.post(endPoints.embedding, [embedding], (req, res, next) => {});

export default router;

//------------- Router handler -------------

function hello(req, res, next) {
  res.send(config.api);
}

function embedding(req, res, next) {
  res.setHeader("Content-Type", "text/plain");
  const requestData = req.body;
  const prompt = sanitize(requestData.prompt);
  const model = getModel(requestData);
  if (!model) {
    res.status(400).send('Invalid model request');
    return;
  }
  const command = `${config.inferEmbeddingBinPath} -m ${model.model_path} --embedding --log-disable -t ${config.maxInferenceThreads} -p "${prompt}"`;
  executeCommand(command, req, res);
}

function infer(req, res, next) {
  prepareCommand(req, res, next)
}

function prepareCommand(req, res, next) {
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Transfer-Encoding", "chunked");

  const requestData = req.body;
  const prompt = sanitize(requestData.prompt);
  const grammar = requestData.grammar && config.grammar[requestData.grammar] ? ` --grammar-file ${config.grammar[requestData.grammar]}` : ''
  const stopWords = requestData.stop ? requestData.stop.map(word => ` -r '${word}'`).join('') : '';
  const model = getModel(requestData);
  if (!model) {
    res.status(400).send('Invalid model request');
    return;
  }
  const projection = (model.capabilities.vision && model.mmproj_path) ? ` --mmproj ${model.mmproj_path}` : '';

  // Build model arguments
  let optionalModelArgs = '';
  for (const key in config.modelArgs) {
    if (requestData[key]) {
      optionalModelArgs += ` ${config.modelArgs[key]} ${requestData[key]}`;
    }
  }

  const modelPath = model.model_path;
  const imagePath = prepareImagePayload(requestData);
  const imageParam = imagePath ? ` --image ${imagePath}` : ''

  let inferBin = config.inferTextBinPath;
  if (imageParam) {
    inferBin = config.inferVisionBinPath;
  }

  const command = `${inferBin} -m ${modelPath}${projection}${optionalModelArgs}${stopWords}${grammar}${imageParam} -t ${config.maxInferenceThreads} --log-disable --no-display-prompt -c 0 -ngl 9999 -p "${prompt}"`;
  executeCommand(command, req, res, requestData.stop, [imagePath]);
}

function executeCommand(command, req, res, stopWords, tmpFiles) {
  let modelProcess = undefined;
  // We must listen to socket close instead of request close
  // Request will be closed as soon as Express json middlewere reads it in full
  req.socket.on('close', () => stop(modelProcess));

  let chunks = '';

  modelProcess = exec(command, {
    shell: true
  });
  modelProcess.stdout.on('data', (data) => {
    chunks += data.toString();
    if (/[\s\n]/.test(chunks)) {
      // llama.cpp inference is done using -r option that specify reverse prompts
      // So its enough to simply remove the stop word here, llama.cpp stops
      // generating text after the first stop word.
      if (stopWords) res.write(removeStopWords(chunks, stopWords));
      else res.write(chunks);
      chunks = '';
    }
  });
  modelProcess.stderr.on('data', (data) => {
    //We do not stream model details
  });
  modelProcess.on('close', (code) => {
    res.write(chunks); // any remaining data
    res.end();
    clearFiles(tmpFiles);
  });
  modelProcess.on('error', (err) => {
    logger.error(err, `Failed command: ${command}`);
    res.status(500).send('Error executing LLM command');
    clearFiles(tmpFiles);
  });
}

function getModel(requestData) {
  const hasImage = requestData.image_data ? true : false;
  let model = null;
  if (requestData.model) {
    model = config.modelsConfig.find(model => (model.name === requestData.model));
    if (hasImage && !model.capabilities.vision) {
      return null;
    }
  } else {
    model = hasImage ? config.defaultVisionModel : config.defaultTextModel;
  }
  return model;
}

function stop(process) {
  if (process) process.kill();
}

function sanitize(input) {
  return input.replace(/(["'`\\])/g, '\\$1');
}

function removeStopWords(str, stopWords) {
  let result = str;
  stopWords.some(stopWord => {
    if (str.includes(stopWord)) {
      result = str.slice(0, str.indexOf(stopWord));
      return true;
    }
  });
  return result;
}

function prepareImagePayload(requestData) {
  if (requestData.image_data) {
    try {
      const base64Image = requestData.image_data.split(';base64,').pop();
      const randomId = crypto.randomBytes(8).toString('hex');
      const imageFilePath = path.join(config.tmpDir, `tempImage_${randomId}`);
      fs.writeFileSync(imageFilePath, base64Image, {encoding: 'base64'});
      return imageFilePath;
    } catch (err) {
      logger.error(err);
      return '';
    }
  }
  return '';
}

function clearFiles(fileList) {
  if (!fileList) return;
  fileList.forEach((path) => {
    if (path) {
      try {
        fs.unlinkSync(path);
      } catch (err) {
        logger.error(err);
      }
    }
  });
}
