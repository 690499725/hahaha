// Coze API 配置
const COZE_API_CONFIG = {
  baseURL: import.meta.env.VITE_COZE_API_URL || 'https://api.coze.cn/v3',
  botId:  '7542771729836769320',
  apiKey: import.meta.env.VITE_COZE_API_KEY || 'pat_nfFPURqvNeN1P6lYR2wnHlc2eamrDrfOT2pMKji7wHHU7BBE7BwECN9poUwDkyGQ'
}

// 生成随机用户ID
const generateUserId = () => {
  return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
}

// 聊天API调用
export const chatWithCoze = async (message, stream = true) => {
  try {
    console.log('发送消息到Coze API:', message)
    
    const response = await fetch(`${COZE_API_CONFIG.baseURL}/chat`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${COZE_API_CONFIG.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        bot_id: COZE_API_CONFIG.botId,
        user_id: generateUserId(),
        stream: stream,
        additional_messages: [
          {
            content_type: 'text',
            role: 'user',
            type: 'question',
            content: message
          }
        ],
        parameters: {}
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('API响应错误:', response.status, errorText)
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`)
    }

    if (stream) {
      // 处理流式响应
      return response.body
    } else {
      // 处理普通响应
      const data = await response.json()
      return data
    }
  } catch (error) {
    console.error('Coze API调用失败:', error)
    throw error
  }
}

// 流式响应处理 - 实时显示版本
export const handleStreamResponse = async (stream, onMessage, onThinkingComplete) => {
  try {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let reasoningContent = ''
    let finalContent = ''
    let hasShownReasoning = false
    let hasShownFinal = false
    let totalChunks = 0
    // 记录已展示的长度，避免重复
    let shownReasoningLen = 0
    let shownFinalLen = 0
    
    console.log('开始处理流式响应...')
    
    while (true) {
      const { done, value } = await reader.read()
      
      if (done) {
        console.log('流读取完成，总共处理了', totalChunks, '个数据块')
        break
      }
      
      totalChunks++
      const chunk = decoder.decode(value)
      console.log(`数据块 ${totalChunks}:`, chunk)
      
      const lines = chunk.split('\n')
      
      for (const line of lines) {
        if (line.trim() === '') continue
        
        // 处理Coze API的特定格式
        if (line.startsWith('event:')) {
          const eventType = line.slice(6).trim()
          console.log('收到事件类型:', eventType)
        } else if (line.startsWith('data:')) {
          const data = line.slice(5).trim()
          
          if (data === '[DONE]') {
            console.log('收到[DONE]信号，流式响应结束')
            console.log('最终推理内容:', reasoningContent)
            console.log('最终回复内容:', finalContent)
            
            // 如果有最终内容但还没显示过，显示最终回答
            if (finalContent && !hasShownFinal) {
              console.log('显示最终内容')
              onMessage(finalContent, 'final')
              hasShownFinal = true
            }
            
            // 通知思考完成
            if (onThinkingComplete) {
              onThinkingComplete()
            }
            
            return // 直接返回，不再继续处理
          }
          
          try {
            const parsed = JSON.parse(data)
            console.log('解析的数据:', parsed)
            
            // 处理不同类型的消息
            if (parsed.role === 'assistant' && parsed.type === 'answer') {
              // 处理推理内容: 仅追加新内容，兼容“增量片段”或“累计片段”两种情况
              if (parsed.reasoning_content) {
                const incoming = String(parsed.reasoning_content)
                if (incoming.startsWith(reasoningContent)) {
                  // 累计片段：只取增量部分
                  const delta = incoming.slice(reasoningContent.length)
                  reasoningContent = incoming
                  if (delta) {
                    if (!hasShownReasoning) {
                      onMessage(delta, 'append-reasoning')
                      hasShownReasoning = true
                      shownReasoningLen += delta.length
                    } else {
                      onMessage(delta, 'append-reasoning')
                      shownReasoningLen += delta.length
                    }
                  }
                } else {
                  // 增量片段：直接追加
                  reasoningContent += incoming
                  onMessage(incoming, 'append-reasoning')
                  hasShownReasoning = true
                  shownReasoningLen += incoming.length
                }
              }

              // 处理最终内容: 同样仅追加新内容
              if (parsed.content) {
                const incoming = String(parsed.content)
                if (incoming.startsWith(finalContent)) {
                  const delta = incoming.slice(finalContent.length)
                  finalContent = incoming
                  if (delta) {
                    if (!hasShownFinal) {
                      onMessage(delta, 'append-final')
                      hasShownFinal = true
                      shownFinalLen += delta.length
                    } else {
                      onMessage(delta, 'append-final')
                      shownFinalLen += delta.length
                    }
                  }
                } else {
                  finalContent += incoming
                  if (!hasShownFinal) {
                    onMessage(incoming, 'append-final')
                    hasShownFinal = true
                  } else {
                    onMessage(incoming, 'append-final')
                  }
                  shownFinalLen += incoming.length
                }
              }
            }
            
            // 处理follow_up问题
            if (parsed.type === 'follow_up' && parsed.content) {
              console.log('收到后续问题:', parsed.content)
            }
            
          } catch (e) {
            console.log('解析流数据失败:', e, '原始数据:', data)
          }
        }
      }
    }
    
    // 如果流结束但没有触发[DONE]，也要显示内容
    console.log('流处理完成，检查是否有未显示的内容')
    if (!hasShownReasoning && reasoningContent) {
      console.log('流结束，显示推理内容:', reasoningContent)
      onMessage(`**思考过程：**\n${reasoningContent}`, 'reasoning')
      hasShownReasoning = true
    }
    
    if (!hasShownFinal && finalContent) {
      console.log('流结束，显示最终内容:', finalContent)
      onMessage(finalContent, 'final')
      hasShownFinal = true
    }
    
    // 如果没有任何内容，显示错误信息
    if (!reasoningContent && !finalContent) {
      console.log('没有收到任何内容')
      onMessage('抱歉，没有收到有效的回复。', 'error')
    }
    
  } catch (error) {
    console.error('处理流式响应失败:', error)
    throw error
  }
}

// 非流式响应处理 - 修复版本
export const handleNormalResponse = async (response) => {
  try {
    console.log('处理非流式响应:', response)
    
    // 如果response已经是字符串，直接返回
    if (typeof response === 'string') {
      return response
    }
    
    // 如果response是Response对象，需要解析JSON
    if (response instanceof Response) {
      const data = await response.json()
      console.log('解析的响应数据:', data)
      
      // 查找assistant的回复内容
      if (data.choices && data.choices[0] && data.choices[0].message) {
        return data.choices[0].message.content || '抱歉，我没有收到有效的回复。'
      }
      
      // 如果是Coze格式的响应
      if (data.role === 'assistant' && data.content) {
        return data.content
      }
      
      // 如果是数组格式，查找最后一个assistant消息
      if (Array.isArray(data)) {
        const assistantMessage = data.find(msg => msg.role === 'assistant')
        if (assistantMessage && assistantMessage.content) {
          return assistantMessage.content
        }
      }
      
      return '抱歉，我没有收到有效的回复。'
    }
    
    // 如果response已经是对象
    if (typeof response === 'object' && response !== null) {
      console.log('响应对象:', response)
      
      // 查找assistant的回复内容
      if (response.choices && response.choices[0] && response.choices[0].message) {
        return response.choices[0].message.content || '抱歉，我没有收到有效的回复。'
      }
      
      // 如果是Coze格式的响应
      if (response.role === 'assistant' && response.content) {
        return response.content
      }
      
      // 如果是数组格式，查找最后一个assistant消息
      if (Array.isArray(response)) {
        const assistantMessage = response.find(msg => msg.role === 'assistant')
        if (assistantMessage && assistantMessage.content) {
          return assistantMessage.content
        }
      }
      
      return '抱歉，我没有收到有效的回复。'
    }
    
    return '抱歉，我没有收到有效的回复。'
  } catch (error) {
    console.error('处理响应失败:', error)
    throw error
  }
}

// 测试API连接
export const testApiConnection = async () => {
  try {
    const response = await chatWithCoze('测试连接', false)
    return true
  } catch (error) {
    console.error('API连接测试失败:', error)
    return false
  }
}
