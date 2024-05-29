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
import request from 'supertest';
import { expect } from 'chai';
import config from '../config.js'
import app from '../server/express-server.js';

describe('API Endpoints', () => {

  /******************************************************************************************
    API meta test
    `/api`
  *******************************************************************************************/
  it('should return the correct response structure for /api', (done) => {
    request(app)
      .get('/api')
      .expect('Content-Type', /json/)
      .expect(200)
      .end((err, res) => {
        if (err) return done(err);
        const { body } = res;

        // 1. Assert meta object
        expect(body.meta).to.be.an('object');
        expect(body.meta.version).to.be.a('string');
        expect(body.meta.license).to.be.a('string');

        // 2. Assert models array
        expect(body.models).to.be.an('array');
        expect(body.models.length).to.be.above(0);
        const model = body.models[0];
        expect(model.name).to.be.a('string');
        expect(model.license).to.be.a('string');
        expect(model.capabilities).to.be.an('object');

        // 3. Assert capabilities object
        expect(body.capabilities).to.be.an('object');
        expect(body.capabilities.text).to.be.true;

        // 4. Assert endpoints object
        expect(body.endpoints).to.be.an('object');
        expect(body.endpoints.infer).to.be.a('string');
        expect(body.endpoints.embedding).to.be.a('string');

        done();
      });
  });

  /******************************************************************************************
    Text completion test
    `/api/infer`
  *******************************************************************************************/
  it('should return response for /api/infer', (done) => {
    const params = {
      prompt: 'What\'s the purpose of our Universe?',
      temperature: 0.3,
      n_predict: 10,
      mirostat: 2
    };
    request(app)
      .post('/api/infer')
      .send(params)
      .expect('Content-Type', 'text/plain')
      .expect('Transfer-Encoding', 'chunked')
      .expect(200)
      .end((err, res) => {
        if (err) return done(err);
        expect(res.text).to.exist;
        done();
      });
  }).timeout(1000 * 60 * 5);

  it('should return response for /api/infer with named model', (done) => {
    const params = {
      model: config.defaultTextModel.name,
      prompt: 'What\'s the purpose of our Universe?',
      temperature: 0.3,
      n_predict: 10,
      mirostat: 2
    };
    request(app)
      .post('/api/infer')
      .send(params)
      .expect('Content-Type', 'text/plain')
      .expect('Transfer-Encoding', 'chunked')
      .expect(200)
      .end((err, res) => {
        if (err) return done(err);
        expect(res.text).to.exist;
        done();
      });
  }).timeout(1000 * 60 * 5);

  /******************************************************************************************
    Embeddings test
    `/api/embedding`
  *******************************************************************************************/
  it('should return response for /api/embedding', (done) => {
    const params = {
      prompt: 'Hello World',
    };
    request(app)
      .post('/api/embedding')
      .send(params)
      .expect('Content-Type', 'text/plain')
      .expect(200)
      .end((err, res) => {
        if (err) return done(err);
        expect(res.text).to.exist;
        done();
      });
  }).timeout(1000 * 60 * 5);

  /******************************************************************************************
    Vision API test
    `/api/infer` with `image_data`
  *******************************************************************************************/
  const imageData = fs.readFileSync('./test/test.jpeg');
  const base64ImageData = Buffer.from(imageData).toString('base64');
  it('should return response for vision API call to /api/infer', (done) => {
    const params = {
      prompt: 'What\'s in this image?',
      image_data: base64ImageData,
      temperature: 0.1,
      n_predict: 10,
      mirostat: 2
    };
    request(app)
      .post('/api/infer')
      .send(params)
      .expect('Content-Type', 'text/plain')
      .expect('Transfer-Encoding', 'chunked')
      .expect(200)
      .end((err, res) => {
        if (err) return done(err);
        expect(res.text).to.exist;
        done();
      });
  }).timeout(1000 * 60 * 5);

});
