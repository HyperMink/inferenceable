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
      commands: {
          "model": ["/model", "/m"],
          "template": ["/template", "/t"],
          "save": ["/save", "/s"],
          "help": ["/help", "/h"],
          "stop": ["/stop", "/st", "abort", "/abort"]
      },
      userprompt: '',
      chatLog: [], // parsed and markdown -> HTML
      templateConfig: {
        actors: {
          user: {name: 'Human', avatar: ''},
          ai: {name: 'HyperMink', avatar: '/chat/img/logo/hypermink-assistant.png'}
        },
        chatLogMemorySize: 20000, // How much chat history we wanna send back with each prompt
        template: '<|user|>\nWho are you?<|end|>\n<|assistant|>\nNice to meet you too, I am HyperMink, your personal AI assistant, I am here to answer all your questions<|end|>\n<|user|>\nWow! thank you, lets start then<|end|>\n<|assistant|>\n[memory]\nHyperMink: ',
      },
      llmUserConfig: {
        n_predict: 2000,
        temperature: 0.3,
        repeat_penalty: 1.1,
        repeat_last_n: 64,
        mirostat: 2,
        mirostat_lr: 0.1,
        mirostat_ent: 5.0
      },
      configChanged: false,
      urlParams: new URLSearchParams(window.location.search),
      fetching: false,
      streaming: false,
      scrolledUp: false,
      hasNewContent: false,
      file: {
        data: '', // DataURL
        type: '', // content type
        name: '',
        textContent: '' // if text extracted
      },
      hide: false,
      section: {
        help: false,
        model: false,
        template: false
      },
    }
  },
  created() {
    window.addEventListener('keydown', (event) => {
      const isCmdOrCtrlPressed = event.metaKey || event.ctrlKey;
      if (isCmdOrCtrlPressed && event.key.toLowerCase() === '0') {
        this.hide = !this.hide
      }
      return false
    });

    this.loadConfig()

    let healthCheckInProgress = false
    const healthCheckInterval = setInterval(async () => {
      if (healthCheckInProgress) return // otherwise this can pile up with auth
      healthCheckInProgress = true
      await this.checkHealth()
      if (this.api.capabilities.text) {
        this.api.available = true
        clearInterval(healthCheckInterval)
        this.chatLog.push({actor: 'ai', text: 'Hello! 👋 how can I assist you today?'})
      }
    }, 1000)
  },
  watch: {
    userprompt(newValue, oldValue) {
      if (!oldValue) {
        // User prompt is empty and user has started to type...
        // Hide any section (help, model card, template etc)
        this.hideSections()
      }
    },
  },
  computed: {
    instruction() {
      const template = this.templateConfig.template.replace(/\[memory\]/g, "${this.memory}");
      return eval('`' + template + '`')
    },
    tokenChars() {
      const chars = this.llmUserConfig.n_predict * 4
      return chars > 0 ? chars : '∞'
    },
    temperatureDisplay() {
      switch (true) {
        case (this.llmUserConfig.temperature < 0.3):
          return 'Rigid'
        case (this.llmUserConfig.temperature > 0.8):
          return 'Delusional'
        default:
          return 'Creative'
      }
    },
    hasVision() {
      return this.api.capabilities.vision
    },
    hasImage() {
      return this.file.type.startsWith('image/')
    },
    hasPDF() {
      return this.file.type == 'application/pdf'
    },
    hasTxtFile() { // CSV or any other text file..
      return this.file.type == 'text/plain' || this.file.type == 'text/csv' || this.file.name.endsWith('.csv')
    },
    hasFile() {
      return this.hasPDF || this.hasTxtFile
    },
    llmConfig() {
      this.llmUserConfig.stop = ["</s>", "<|end|>", "<|user|>", "<|assistant|>", "<|im_end|>", "user:", "User:", `${this.templateConfig.actors.user.name}:`, `${this.templateConfig.actors.user.name.toLowerCase()}:`]
      if (this.llmUserConfig.n_predict < 1) this.llmUserConfig.n_predict = -1
      return this.llmUserConfig
    },
    initials() {
      const name = this.templateConfig.actors.user.name.trim()
      return name ? (name.split(' ').map(w => w.charAt(0)).join('').toUpperCase().slice(0, 2) || name.charAt(0).toUpperCase()) : 'HU'
    },
    memory() {
      let totalCharacters = 0
      let resultString = ''
      for (let i = this.chatLog.length - 1; i >= 0; i--) {
        const obj = this.chatLog[i]
        if (!obj.text) continue
        const potentialTotalCharacters = totalCharacters + obj.text.length
        if (potentialTotalCharacters <= this.templateConfig.chatLogMemorySize) {
          resultString = `${this.templateConfig.actors[obj.actor].name}: ${obj.text}\n${resultString}`
          totalCharacters = potentialTotalCharacters
        } else {
          break
        }
      }
      return resultString
    },
  },
  methods: {
    sendMessage(event) {
      if (!this.api.available || this.streaming) return
      if (event.shiftKey) {
        this.userprompt += '\n'
      } else {
        this.hideSections()
        this.userprompt = this.userprompt.trim()
        if (!this.userprompt) return
        const command = this.getCommand()
        if (command) {
          this.handleCommand(command)
        } else {
          this.query()
        }
        this.$refs.promptbox.style.height = 'auto'
        if (this.isTouchDevice)
          this.$refs.promptbox.blur()
      }
    },
    handleCommand(command) {
      if (command == 'save') {
        this.saveConfig()
        this.showSection(command, true)
      } else {
        this.showSection(command, true)
      }
    },
    hideSections() {
      Object.keys(this.section).forEach(key => this.section[key] = false)
    },
    showSection(section, clearPrompt) {
      if (clearPrompt) this.userprompt = ''
      this.scrollDown()
      this.section[section] = true
    },
    selectMenu(section) {
      if (this.section[section]) this.hideSections()
      else {
        this.hideSections()
        this.showSection(section, false)
      }
    },
    handleChatScroll(event) {
      this.scrolledUp = (this.$refs.chatlog.scrollTop < -100) ? true : false
      if (!this.scrolledUp) this.hasNewContent = false
    },
    scrollDown() {
      this.$refs.chatlog.scrollTo({
        top: this.$refs.chatlog.scrollHeight + 200,
        behavior: 'smooth'
      });
    },
    async query() {
      let context = ''
      this.scrollDown() // always scrollDown when a new question is posted
      this.chatLog.push({actor: 'user', image: this.hasImage ? this.file.data : '', text: this.userprompt})

      this.userprompt = ''
      this.streaming = true

      if (this.file.textContent) {
        const uiTextContent = '<div><details><summary>'+this.file.name+'</summary><p>'+ '\n[--- Use this file content to answer questions ---]\n' + this.file.textContent + '\n[--- End of file content ---]\n' + '</p></details></div>'
        context = uiTextContent
      }
      this.chatLog[this.chatLog.length - 1].text += context.trim()

      let imagePayload = {image_data: ''}
      if (this.hasImage) {
        imagePayload.image_data = this.file.data
      }

      const prompt = this.instruction
      this.fetching = true
      this.chatLog.push({actor: 'ai', text: ''})
      await this.complete(this.llmConfig, imagePayload, prompt)
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
        this.fetching = false
      } catch (e) {
        console.error(e)
      }
    },
    handleFileInputChange(event) {
      const file = event.target.files[0]
      if (file) {
        this.file.type = file.type
        this.file.name = file.name
        const reader = new FileReader()
        if (this.hasImage) {
          reader.onload = () => {
            this.file.data = reader.result
            this.resizeImage(this.file.data, 512, (resizedImage) => {
              this.file.data = resizedImage
              this.$refs.fileInput.value = null
            })
          };
          reader.readAsDataURL(file)
        } else if (this.hasPDF) {
          reader.onload = () => {
            this.file.data = reader.result
            this.$refs.fileInput.value = null
            this.parsePDF()
          };
          reader.readAsArrayBuffer(file)
        } else if (this.hasTxtFile) {
          reader.onload = () => {
            this.file.data = reader.result
            this.file.textContent = this.file.data
            this.$refs.fileInput.value = null
         };
         reader.readAsText(file)
       }
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
        const resizedImage = canvas.toDataURL('image/jpeg')
        callback(resizedImage)
        canvas.width = 0
        canvas.height = 0
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        img.src = ''
      };
      img.src = imageData
    },
    getCommand() {
      const lowerText = this.userprompt.trim().toLowerCase()
      for (const cmd in this.commands) {
        if (this.commands[cmd].some(abbreviation => lowerText.startsWith(abbreviation))) {
          return cmd
        }
      }
      return false
    },
    async parsePDF() {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/common/js/pdf/pdf.worker.mjs"
      const loadingTask = pdfjsLib.getDocument({ data: this.file.data })
      const pdfDocument = await loadingTask.promise
      for (let pageNum=1; pageNum <= pdfDocument.numPages; pageNum++) {
        const page = await pdfDocument.getPage(pageNum)
        const textObj = await page.getTextContent()
        for (const item of textObj.items) {
          this.file.textContent += ' ' + item.str
        }
        page.cleanup()
      }
    },
    saveConfig () {
      this.set('hypermink_llmUserConfig', JSON.stringify(this.llmUserConfig))
      this.set('hypermink_templateConfig', JSON.stringify(this.templateConfig))
    },
    loadConfig () {
      const storedLlmUserConfig = this.get('hypermink_llmUserConfig')
      const storedTemplateConfig = this.get('hypermink_templateConfig')
      if (storedLlmUserConfig) {
        this.llmUserConfig = JSON.parse(storedLlmUserConfig)
      }
      if (storedTemplateConfig) {
        this.templateConfig = JSON.parse(storedTemplateConfig)
      }
    },
    get (key) {
      return localStorage.getItem(key)
    },
    set (key, value) {
      localStorage.setItem(key, value)
    },
    async complete(params = {}, imagePayload, prompt) {
      const completionParams = { ...params, ...imagePayload, prompt };
      const decoder = new TextDecoder();
      abortController = new AbortController();
      const abortSignal = abortController.signal;
      let chunks = '';

      try {
        const apiEndPoint = this.api.endpoints.infer
        this.removeFile();
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
            this.chatLog[this.chatLog.length - 1].text += decoder.decode(value);
            this.hasNewContent = true;
            await readStream();
          } catch (e) {
            if (e.message && e.message.includes('aborted')) {
              this.chatLog[this.chatLog.length - 1].text += '...';
            } else {
              console.error('Error reading stream:', e);
              this.abortRequest()
            }
          }
        };
        await readStream(); // Start reading the stream
      } catch (e) {
        if (e.message && e.message.includes('aborted')) {
          this.chatLog[this.chatLog.length - 1].text += '...';
        }
        console.error(e);
        this.abortRequest()
        this.fetching = false;
      }
    },
  }
})

app.mount('#app')
