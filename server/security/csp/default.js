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

import helmet from 'helmet';
import config from '../../../config.js';

const rootOptions = {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", (req, res) => "'unsafe-eval'"],
  },
  reportOnly: false,
}

const apiOptions = {
  directives: {
    defaultSrc: ["'self'"],
  },
  reportOnly: false,
}

if (!config.upgradeInsecureRequests) {
  rootOptions.directives['upgradeInsecureRequests'] = null
  apiOptions.directives['upgradeInsecureRequests'] = null
}

class CSP {
  static root = helmet.contentSecurityPolicy(rootOptions);
  static api = helmet.contentSecurityPolicy(apiOptions);
}

export default CSP;
