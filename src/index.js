import moment from 'moment'

const GITHUB_ACCESS_TOKEN = PropertiesService.getScriptProperties().getProperty(
  'GITHUB_ACCESS_TOKEN'
)
const FILE_PATH_PLACEHOLDER = ':path'
const FILE_URL = `https://api.github.com/repos/yukihirai0505/interview/contents/${FILE_PATH_PLACEHOLDER}?access_token=${GITHUB_ACCESS_TOKEN}`
const MAIL_TO = 'yukihirai0505@gmail.com'

const execute = (url, params) => {
  const options = {
    method: 'PUT',
    payload: JSON.stringify(params)
  }
  return JSON.parse(UrlFetchApp.fetch(url, options).getContentText())
}

const pushFile = (message, content, path) => {
  const params = {
    message,
    committer: {
      name: 'Yuki Hirai',
      email: 'yukihirai0505@gmail.com'
    },
    content: Utilities.base64Encode(content)
  }
  const response = execute(FILE_URL.replace(FILE_PATH_PLACEHOLDER, path), params)
  Logger.log(response)
}

const uploadFile = (postId, content) => {
  const message = `Add a new article for postId: ${postId}`
  pushFile(message, content, `src/pages/blog/${postId}.md`)
}

const uploadImage = (fileId, postId) => {
  const file = DriveApp.getFileById(fileId)
  const message = `Upload image file for postId: ${postId}`
  const content = file.getBlob().getBytes()
  const path = `/img/${postId}/${Date.now()}_${file.getName()}`
  pushFile(message, content, `static${path}`)
  return path
}

const createBody = ({ question, answer, postId }) => {
  switch (question) {
    case '自己紹介':
      return `selfIntroduction: ${answer}\n`
    case 'タイトル':
      return `title: ${answer}\n`
    case 'サブタイトル':
      return `subTitle: ${answer}\n`
    case 'キャプチャ画像': {
      const path = uploadImage(answer, postId)
      return `captchaImage: ${path}\n`
    }
    case 'テンプレート一覧':
      return answer === '個人開発サービス紹介'
        ? `templateType: individual-developer\n`
        : 'templateType: normal\n'
    case 'ニックネーム':
      return `nickname: ${answer}\n`
    case 'アイコン': {
      const path = uploadImage(answer, postId)
      return `iconImage: ${path}\n`
    }
    case 'Twitterアカウント名(@の後)':
      return `twitterAccountName: ${answer}\n`
    default:
      return ''
  }
}

function createIndividualDeveloperContents(questionNum, contents, question, answer, postId) {
  switch (question) {
    case '今回紹介したいのはどういったサービスですか？':
    case 'なぜそのようなサービスを作られたのですか？':
    case 'このサービスのイチオシポイントはどこですか？':
    case '最後に今後の意気込みをお願いします！':
      return { question, answer }
    case '画像を差し込む(オプション)': {
      const content = contents[questionNum]
      content.imagePath = uploadImage(answer, postId)
      return content
    }
    case '画像の説明(オプション)': {
      const content = contents[questionNum]
      if (content.imagePath) {
        content.imageDescription = answer
      }
      return content
    }
    default:
      return {}
  }
}

function createNormalContents(questionNum, contents, question, answer, postId) {
  switch (question) {
    case '質問①':
    case '質問②':
    case '質問③':
    case '質問④':
    case '質問⑤':
    case '質問⑥':
      return { question }
    case '回答①':
    case '回答②':
    case '回答③':
    case '回答④':
    case '回答⑤':
    case '回答⑥': {
      const content = contents[questionNum]
      content.answer = answer
      return content
    }
    case '画像を差し込む(オプション)': {
      const content = contents[questionNum]
      content.imagePath = uploadImage(answer, postId)
      return content
    }
    case '画像の説明(オプション)': {
      const content = contents[questionNum]
      if (content.imagePath) {
        content.imageDescription = answer
      }
      return content
    }
    default:
      return {}
  }
}

const needToContentCountUp = question => {
  switch (question) {
    case 'なぜそのようなサービスを作られたのですか？':
    case 'このサービスのイチオシポイントはどこですか？':
    case '最後に今後の意気込みをお願いします！':
    case '質問②':
    case '質問③':
    case '質問④':
    case '質問⑤':
    case '質問⑥':
      return true
    default:
      return false
  }
}

global.createBlogPost = e => {
  function getMessage(itemResponses) {
    const subject = '【取材完了】 '
    let body = '---\n'
    body += 'templateKey: blog-post\n'
    const date = moment().format()
    body += `date: ${date}\n`
    const postId = moment().unix()
    let templateType = ''
    let questionNum = 0
    const contents = []
    itemResponses.forEach(itemResponse => {
      const question = itemResponse.getItem().getTitle()
      const answer = itemResponse.getResponse()
      if (templateType) {
        questionNum = needToContentCountUp(question) ? questionNum + 1 : questionNum
        if (templateType === '個人開発サービス紹介') {
          if (question === 'サービス名') {
            body += `serviceName: ${answer}\n`
            return
          }
          contents[questionNum] = createIndividualDeveloperContents(
            questionNum,
            contents,
            question,
            answer,
            postId
          )
        } else if (templateType === 'しない(フルカスタム)') {
          contents[questionNum] = createNormalContents(
            questionNum,
            contents,
            question,
            answer,
            postId
          )
        }
      } else {
        body += createBody({ question, answer, postId })
      }
      if (question === 'テンプレート一覧') {
        templateType = answer
      }
    })
    body += 'contents:\n'
    contents.forEach(content => {
      body += `  - question: ${content.question}\n`
      body += `    answer: ${content.answer}\n`
      if (content.imagePath) {
        body += `    imagePath: ${content.imagePath}\n`
      }
      if (content.imageDescription) {
        body += `    imageDescription: ${content.imageDescription}\n`
      }
    })
    body += '---\n'
    uploadFile(postId, body)
    return { subject, body }
  }

  try {
    const itemResponses = e.response.getItemResponses()
    const { subject, body } = getMessage(itemResponses)
    const options = {
      replyTo: MAIL_TO
    }
    MailApp.sendEmail(MAIL_TO, subject, body, options)
  } catch (err) {
    MailApp.sendEmail(MAIL_TO, 'Error', err)
  }
}
