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
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Config {
  constructor() {
    this.platform = os.platform();
    this.staticResourcePath = path.join(__dirname, 'static');
    this.dataPath = path.join(__dirname, 'data');

    this.tmpDir = process.env.INFER_TMP_DIR || os.tmpdir();
    this.httpPort = process.env.INFER_HTTP_PORT || 3000;

    // A simple UI is provided
    this.uiPath = process.env.INFER_UI_PATH || path.join(this.staticResourcePath, 'ui');

    // Max threads for llama.cpp
    this.maxInferenceThreads = process.env.INFER_MAX_THREADS || 4;
    // Max HTTP workers
    this.maxHttpWorkers = process.env.INFER_MAX_HTTP_WORKERS || os.cpus().length;

    /******************************************************************************************
      Executable (llama.cpp, αcτµαlly pδrταblε εxεcµταblε)

      Inferenceable uses a single binary 'inferenceable_bin' that combines llama.cpp main,
      embedding and llava. This binary is an 'αcτµαlly pδrταblε εxεcµταblε | see https://justine.lol/ape.html'
      You can use custom llama.cpp builds here.
    *******************************************************************************************/
    this.inferTextBinPath = process.env.INFER_TEXT_BIN_PATH || path.join(this.dataPath, 'bin', 'inferenceable_bin');
    this.inferVisionBinPath = process.env.INFER_VISION_BIN_PATH || this.inferTextBinPath;
    this.inferEmbeddingBinPath = process.env.INFER_EMBEDDING_BIN_PATH || this.inferTextBinPath;

    // Note: If you are exporting a custom llama.cpp binary, make sure to give it a different name
    // if it's not an αcτµαlly pδrταblε εxεcµταblε.
    if (this.platform === 'win32' && this.inferTextBinPath.endsWith('inferenceable_bin')) {
      // simply rename to .exe if running on Windows
      fs.renameSync(this.inferTextBinPath, `${this.inferTextBinPath}.exe`);
      this.inferTextBinPath = `${this.inferTextBinPath}.exe`;
    }

    /******************************************************************************************
      API
    *******************************************************************************************/
    this.packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    this.api = {
      meta: {
        // Warning, do not expose more than these from packagae.json
        version: this.packageJson.version,
        license: this.packageJson.license,
        code: this.packageJson.repository ? this.packageJson.repository.url : '',
        author: this.packageJson.author || ''
      },
      models: []
    };

    /******************************************************************************************
      Model weights
      A default model config is provided 'data/models.json'. If the resource at 'model_path' does not
      exist, it will be downloaded on the first start.

      For custom models.json:
      export INFER_MODEL_CONFIG=data/models.json
    *******************************************************************************************/
    this.modelsConfigPath = process.env.INFER_MODEL_CONFIG || path.join(this.dataPath, 'models.json');
    this.modelsConfig = JSON.parse(fs.readFileSync(this.modelsConfigPath, 'utf8'));
    this.modelsConfig = this.modelsConfig.filter(modelObj => modelObj.required);
    this.modelsConfig.forEach((modelObj) => {
      if (!modelObj.model_path) modelObj.model_path = path.join(this.dataPath , 'models', modelObj.name, 'model.gguf');
      if (modelObj.mmproj_path != undefined && !modelObj.mmproj_path) modelObj.mmproj_path = path.join(this.dataPath , 'models', modelObj.name, 'mmproj.gguf');
      // Set API capabilities
      const model = {
        name: modelObj.name,
        license: modelObj.license,
        capabilities: modelObj.capabilities
      }
      this.api.models.push(model);
    });

    // Default models are the first of each kind
    this.defaultTextModel = this.modelsConfig.find(model => model.capabilities.text);
    this.defaultVisionModel = this.modelsConfig.find(model => model.capabilities.vision);

    /******************************************************************************************
      Grammar files (GBNF)

      For custom grammar files directory:
      export INFER_GRAMMAR_FILES=data/grammar
    *******************************************************************************************/
    const grammarFilesPath = process.env.INFER_GRAMMAR_FILES || path.join(this.dataPath, 'grammar');
    this.grammar = fs.readdirSync(grammarFilesPath)
      .filter(file => file.endsWith('.gbnf'))
      .reduce((acc, file) => {
        const key = file.split('.')[0];
        acc[key] = path.join(grammarFilesPath, file);
        return acc;
      }, {});

    /******************************************************************************************
      Content Security Policy.
      A default policy is provided:

      For custom CSP:
      export INFER_AUTH_CSP=./security/csp/default.js
    *******************************************************************************************/
    this.CSP = process.env.INFER_CSP || path.join(__dirname, 'server', 'security', 'csp', 'default.js');

    /******************************************************************************************
      Rate limiter
      A simple in-memory rate limiter is provided:

      For custom rate limiter:
      export INFER_RATE_LIMITER=./security/rate/memory.js
    *******************************************************************************************/
    this.rateLimiter = process.env.INFER_RATE_LIMITER || path.join(__dirname, 'server', 'security', 'rate', 'memory.js');

    /******************************************************************************************
      Authentication strategies.
      Plug in your own passport.js strategy to authenticate API.

      An example basic auth strategy is provided:
      export INFER_AUTH_STRATEGY=./security/auth/basic.js
    *******************************************************************************************/
    this.authStrategy = process.env.INFER_AUTH_STRATEGY || '';

    /******************************************************************************************
      Set these if you need to set up SSL on a standalone app.
      Note that in production, SSL is usually provided by the infrastructure or the container.
      Use this for simple standalone deployments.
    *******************************************************************************************/
    this.sslPrivateKeyPath = process.env.INFER_SSL_KEY;
    this.sslCertificatePath = process.env.INFER_SSL_CERT;
    this.httpsPort = process.env.INFER_HTTPS_PORT || 443;
    this.upgradeInsecureRequests = (this.sslPrivateKeyPath && this.sslCertificatePath);

    /******************************************************************************************
      Map of HTTP request parameters to llama.cpp arguments.
      You can provide your own 'model-args.json' to support custom model arguments.

      For custom model arguments:
      export INFER_MODEL_ARGS=data/model-args.json
    *******************************************************************************************/
    this.modelsArgsPath = process.env.INFER_MODEL_ARGS || path.join(this.dataPath, 'model-args.json');
    this.modelArgs = JSON.parse(fs.readFileSync(this.modelsArgsPath, 'utf8'));

  }
}

export default new Config();
