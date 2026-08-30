import { Link } from 'react-router'
import { BrandMark } from '@/components/shared/BrandMark'

type LegalKind = 'privacy' | 'terms'

const entity = import.meta.env.VITE_LEGAL_ENTITY?.trim() || '（待填写运营主体）'
const contactEmail = import.meta.env.VITE_LEGAL_CONTACT_EMAIL?.trim() || '（待填写联系邮箱）'
const effectiveDate = import.meta.env.VITE_LEGAL_EFFECTIVE_DATE?.trim() || '（待确认生效日期）'
const isDraft = entity.startsWith('（') || contactEmail.startsWith('（') || effectiveDate.startsWith('（')

export function LegalPage({ kind }: { kind: LegalKind }) {
  const privacy = kind === 'privacy'
  return (
    <div className="min-h-screen bg-muted/20 px-4 py-10">
      <article className="mx-auto max-w-3xl rounded-2xl bg-background p-6 shadow-sm ring-1 ring-foreground/10 sm:p-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <BrandMark />
          <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">返回登录</Link>
        </div>
        {isDraft && (
          <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
            当前页面是上线前产品事实草案；请先补齐运营主体、联系邮箱、生效日期，并由运营方/律师完成最终审阅。
          </div>
        )}
        <p className="text-xs text-muted-foreground">运营主体：{entity} · 生效日期：{effectiveDate}</p>
        <h1 className="mt-2 text-2xl font-semibold">{privacy ? '隐私政策' : '服务条款'}</h1>
        {privacy ? <PrivacyContent /> : <TermsContent />}
        <p className="mt-8 border-t pt-5 text-sm text-muted-foreground">
          隐私、删除或内容举报请求请联系：<a className="underline" href={`mailto:${contactEmail}`}>{contactEmail}</a>
        </p>
      </article>
    </div>
  )
}

function PrivacyContent() {
  return (
    <div className="mt-8 space-y-7 text-sm leading-7 text-muted-foreground">
      <section><h2 className="font-medium text-foreground">1. 收集的信息</h2><p>我们会处理注册邮箱、昵称、头像、登录会话、生成提示词与参数、上传资产、生成结果、积分与用量、反馈/举报内容，以及必要的请求时间、请求 ID、错误和安全日志。</p></section>
      <section><h2 className="font-medium text-foreground">2. 使用目的</h2><p>这些信息用于创建和保护账号、执行生成任务、保存作品、计算积分与用量、处理反馈和举报、排查故障、防止滥用，以及在你主动公开作品时向社区展示对应的公开信息。</p></section>
      <section><h2 className="font-medium text-foreground">3. 第三方处理</h2><p>生成请求可能发送给所选模型提供方（当前接入百炼/DashScope）；持久化媒体可能存储在配置的对象存储服务（当前接入 OSS）。第三方仅按完成服务所需范围处理数据，具体地域、保留期和第三方条款需要在正式上线前由运营方确认并补充。</p></section>
      <section><h2 className="font-medium text-foreground">4. 公开分享与内容治理</h2><p>作品默认属于你的私有数据；只有你主动公开或创建分享链接时，作品的受限展示信息和产物才会对其他人可见。公开作品可能被其他用户举报，管理员可以人工审核并下架，不代表平台作出版权或违法事实认定。</p></section>
      <section><h2 className="font-medium text-foreground">5. 保留、删除和安全</h2><p>我们会在实现服务、审计和安全所需期间保留相关数据。你可以通过账号功能删除可删除的资产/作品，或通过联系邮箱提出账号、个人信息、作品和导出/删除请求；法定留存、备份和已脱敏审计记录可能需要更长时间。我们使用会话 Cookie、访问控制、日志脱敏和对象存储权限控制保护数据，但不能保证绝对安全。</p></section>
      <section><h2 className="font-medium text-foreground">6. Cookie 与更新</h2><p>服务使用必要的 http-only 会话 Cookie，不以此页面承诺非必要追踪或广告画像。政策发生重大变化时会更新页面的生效日期；正式上线前请由运营方补充适用法律、跨境/跨地域传输、未成年人和数据主体权利条款。</p></section>
    </div>
  )
}

function TermsContent() {
  return (
    <div className="mt-8 space-y-7 text-sm leading-7 text-muted-foreground">
      <section><h2 className="font-medium text-foreground">1. 服务范围</h2><p>Bailian Studio 提供登录后的 AI 文本、图像、视频和音频创作、作品管理、分享和社区画廊能力。模型是否可用、参数、价格/积分和第三方服务可能变化。</p></section>
      <section><h2 className="font-medium text-foreground">2. 账号与使用责任</h2><p>你应保护账号凭据，不得绕过访问控制、批量滥用接口、上传恶意文件、侵犯他人隐私或知识产权，不得使用服务生成或传播违法、欺诈、骚扰、暴力、色情或其他违反适用法律及平台规则的内容。</p></section>
      <section><h2 className="font-medium text-foreground">3. 输入、输出与公开作品</h2><p>你应确保拥有提交提示词、参考素材和其他输入的必要权利。AI 输出可能不唯一、不准确或包含第三方模型限制；你需要自行审查并承担发布、使用和公开分享输出的责任。公开作品会进入人工举报与下架流程。</p></section>
      <section><h2 className="font-medium text-foreground">4. 积分、模型和可用性</h2><p>当前积分由管理员配置或赠送，具体抵扣以服务端记录为准；当前版本不提供在线充值或订阅。任务可能排队、失败、取消或受模型提供方限流影响，不承诺持续可用或固定输出时效。</p></section>
      <section><h2 className="font-medium text-foreground">5. 内容举报与处置</h2><p>用户可以举报公开作品，管理员可将举报标记为处理中、解决或驳回，并可下架作品。举报不是司法或版权裁决；如需正式权利通知，请使用运营方确认后的联系渠道。</p></section>
      <section><h2 className="font-medium text-foreground">6. 条款更新与终止</h2><p>违反条款、危害服务或法律要求时，我们可以限制功能、隐藏内容或暂停账号。条款、适用法律、责任限制、争议解决和退款/赔偿条款必须在正式公网发布前由运营方补齐并审阅。</p></section>
    </div>
  )
}
