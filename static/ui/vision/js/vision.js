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

let abortController
const { createApp, ref } = Vue
const app = createApp({
  data() {
    return {
      isTouchDevice: (('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0)),
      api: {
        available: false,
        capabilities: {
          vision: false
        }
      },
      userprompt: '',
      answer: '',
      template: 'A chat between a curious Human and an AI assistant named HyperMink. HyperMink gives helpful, detailed, polite and precise answers to the Human\'s questions.\nHuman: ${this.userprompt}\nHyperMink: ',
      llmUserConfig: {
        n_predict: 2000,
        temperature: 0.1,
        mirostat: 2,
        mirostat_lr: 0.1,
        mirostat_ent: 5.0,
        stop: ["</s>", "<|end|>", "<|user|>", "<|assistant|>", "<|im_end|>", "user:", "User:"]
      },
      fetching: false,
      streaming: false,
      showAnswer: false,
      scrolledUp: false,
      hasNewContent: false,
      file: {
        origin: null, // Original file blob
        data: '', // DataURL
        type: '', // content type
        name: '',
      },
    }
  },
  created() {
    let healthCheckInProgress = false
    const healthCheckInterval = setInterval(async () => {
      if (healthCheckInProgress) return // otherwise this can pile up with auth
      healthCheckInProgress = true
      await this.checkHealth()
      if (this.api.capabilities.text) {
        this.api.available = true
        clearInterval(healthCheckInterval)
      }
    }, 1000)
  },
  computed: {
    instruction() {
      return eval('`' + this.template + '`')
    },
  },
  methods: {
    sendMessage(event) {
      if (!this.api.available || this.streaming) return
      this.userprompt = this.userprompt.trim()
      if (!this.userprompt || !this.file.data) return
      this.showAnswer = true
      this.query()
      if (this.isTouchDevice)
        this.$refs.promptbox.blur()
    },
    async query() {
      this.streaming = true
      const imagePayload = {image_data: this.file.data}
      this.fetching = true
      await this.complete(this.llmUserConfig, imagePayload, this.instruction)
      this.streaming = false
    },
    async checkHealth() {
      try {
        const response = await fetch('/api')
        const data = await response.json()
        if (data) this.api = data
      } catch (e) {
        console.error('Failed to check API status')
        console.error(e)
      }
    },
    safeRender(text) {
      return DOMPurify.sanitize(text, { USE_PROFILES: { html: true } })
    },
    transformAndSafeRender(text) {
      return DOMPurify.sanitize(marked.parse(text), { USE_PROFILES: { html: true } })
    },
    openFileInput() {
      this.$refs.fileInput.click()
    },
    abortRequest() {
      try {
        if (abortController) abortController.abort()
      } catch (e) {
        console.error(e)
      } finally {
        this.fetching = false
        this.showAnswer = false
        this.answer = ''
        this.userprompt = ''
      }
    },
    handleFileInputChange(event) {
      const file = event.target.files[0]
      if (file) {
        this.file.origin = file
        this.file.type = file.type
        this.file.name = file.name
        const reader = new FileReader()
        reader.onload = () => {
          this.file.data = reader.result
          this.resizeImage(this.file.data, 512, (resizedImage) => {
            this.file.data = resizedImage
            this.$refs.fileInput.value = null
          })
        };
        reader.readAsDataURL(file)
      }
    },
    removeFile() {
      Object.keys(this.file).forEach(key => this.file[key] = '')
    },
    resizeImage(imageData, maxWidth, callback) {
      const img = new Image()
      img.onload = () => {
        const canvas = this.$refs.canvas;
        const ctx = canvas.getContext('2d')
        let newWidth = img.width
        let newHeight = img.height
        if (newWidth > maxWidth) {
          const scaleFactor = maxWidth / newWidth
          newWidth *= scaleFactor
          newHeight *= scaleFactor
        }
        canvas.width = newWidth
        canvas.height = newHeight
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, newWidth, newHeight)
        const resizedImage = canvas.toDataURL('image/jpeg') // Change format if needed
        callback(resizedImage)
        canvas.width = 0
        canvas.height = 0
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        img.src = ''
      };
      img.src = imageData
    },
    isShareable() {
      if (!this.fetching && !this.streaming && this.answer.length > 0) {
        return navigator.canShare
      }
    },
    share() {
      const data = {
        titie: this.userprompt,
        text: this.answer,
        files: [this.file.origin]
      }
      navigator.share(data)
    },
    async complete(params = {}, imagePayload, prompt) {
      const completionParams = { ...params, ...imagePayload, prompt };
      const decoder = new TextDecoder();
      abortController = new AbortController();
      const abortSignal = abortController.signal;
      let chunks = '';

      try {
        const apiEndPoint = this.api.endpoints.infer
        //this.removeFile();
        const response = await fetch(apiEndPoint, {
          method: 'POST',
          headers: {
            'Connection': 'keep-alive',
            'Content-Type': 'application/json',
            'Accept': 'text/plain'
          },
          body: JSON.stringify(completionParams),
          signal: abortSignal
        });

        if (!response.ok) { throw new Error('Response error'); }

        this.fetching = false
        const stream = response.body;
        const reader = stream.getReader();
        const readStream = async () => {
          try {
            const { done, value } = await reader.read();
            if (done) { return; }
            this.answer += decoder.decode(value);
            this.hasNewContent = true;
            await readStream(); // Continue reading the stream
          } catch (e) {
            if (e.message && e.message.includes('aborted')) {
              this.answer += '...';
            } else {
              console.error('Error reading stream:', e);
              this.abortRequest()
            }
          }
        };
        await readStream(); // Start reading the stream
      } catch (e) {
        if (e.message && e.message.includes('aborted')) {
          this.answer += '...';
        }
        console.error(e);
        this.abortRequest()
        this.fetching = false;
      }
    },
  }
})

app.mount('#app')
