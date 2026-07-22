// ===== 代理注册（含临时邮箱拦截 + MX 验证）=====

import { jsonResp } from '../utils/response.js';

// 一次性邮箱黑名单（完整版）
const DISPOSABLE = new Set([
  'mailinator.com','guerrillamail.com','guerrillamail.net','10minutemail.com',
  'tempmail.com','temp-mail.org','yopmail.com','maildrop.cc','harakirimail.com',
  'mailnesia.com','fakemail.net','throwawaymail.com','sharklasers.com','spam4.me',
  'trashmail.com','burnermail.io','emailondeck.com','mohmal.com','discard.email',
  'wegwerfmail.de','armyspy.com','cuvox.de','dayrep.com','einrot.com','gustr.com',
  'jourrapide.com','rhyta.com','teleworm.com','trbvm.com','tmpmail.com','tempail.com',
  'getnada.com','getairmail.com','fakeinbox.com','mailcatch.com','mintemail.com',
  'throwaway.email','tempmails.com','tempmailo.com','tempmail.ninja','tempmail.plus',
  'tempinbox.com','tempmailbox.com','tempmails.co','tempmailgen.com','tempr.email',
  'tmpmail.org','tmpbox.net','tmpemails.com','yopmail.fr','yopmail.net',
  'cool.fr.nf','jetable.fr.nf','nospam.ze.tc','nomail.xl.cx','mega.zik.dj',
  'speed.1s.fr','courriel.fr.nf','moncourrier.fr.nf','monemail.fr.nf','monmail.fr.nf',
  '0-mail.com','anonymbox.com','binkmail.com','bobmail.info','bugmenot.com',
  'deadaddress.com','despam.it','disbox.org','emailage.cf','emailsensei.com',
  'explodemail.com','fastacura.com','filzmail.com','fixmail.tk','freemail.ms',
  'gishpuppy.com','goemailgo.com','greensloth.com','hotpop.com','ieatspam.eu',
  'ihateyoualots.info','imails.info','inboxalias.com','jetable.com','kasmail.com',
  'klzlv.com','kulturbetrieb.info','lifebyfood.com','link2mail.net',
  'mailbidon.com','mailblocks.com','mailcatch.com','maildx.com','maildrop.cc',
  'mailforspam.com','mailin8r.com','mailincubator.com','mailmate.com',
  'mailme.gq','mailme.ir','mailme.lv','mailmetrash.com','mailmoat.com',
  'mailnator.com','mailnull.com','mailorg.org','mailsac.com','mailscrap.com',
  'mailseal.de','mailshell.com','mailsiphon.com','mailslite.com','mailzilla.com',
  'mbx.cc','mega.zik.dj','messagebeamer.de','mierdamailo.com','migmail.pl',
  'moakt.com','mobileninja.co.uk','moburl.com','mohmal.com','ms9.mailslite.com',
  'msb.minsmail.com','mspeciosa.com','mssaanmail.com','mt2009.com','mt2014.com',
  'mymail-in.net','myspaceinc.com','myspaceinc.net','myspacepimpedup.com',
  'mytrashmail.com','neomailbox.com','nepwk.com','nervmich.net','nervtmansen.nl',
  'netmails.com','netmails.net','netzidiot.de','neverbox.com','no-spam.ws',
  'nobulk.com','noclickemail.com','nogmailspam.info','nomail.pw','nomail.xl.cx',
  'nomail2me.com','nomorespamemails.com','nonspam.eu','nonspammer.de',
  'noref.in','nospam.ze.tc','nospam4.us','nospamfor.us','nospammail.net',
  'notmailinator.com','nowhere.org','nowmymail.com','ntelos.net',
  'nus.edu.sg','objectmail.com','obobbo.com','odnorazovoe.ru','ohaaa.de',
  'omail.pro','oneoffemail.com','onewaymail.com','onlatedotcom.info',
  'online.ms','oopi.org','opayq.com','ordinaryamerican.net','otherinbox.com',
  'ourklips.com','outlawspam.com','ovpn.to','owlpic.com','pancakemail.com',
  'pjjkp.com','plexolan.de','poczta.onet.pl','politikerclub.de',
  'poofy.org','pookmail.com','privacy.net','privatdemail.net',
  'proxymail.eu','prtnx.com','punkass.com','putthisinyourspamdatabase.com',
  'pwrby.com','qq.com','quickinbox.com','quickmail.nl','rainmail.biz',
  'rcpt.at','reallymymail.com','realtyalerts.ca','recode.me','reconmail.com',
  'regbypass.com','rejectmail.com','remail.cf','remail.ga','rhyta.com',
  'rklips.com','rmqkr.net','royal.net','rppkn.com','rtrtr.com',
  's0ny.net','safe-mail.net','safersignup.de','safetymail.info',
  'safetypost.de','sandelf.de','saynotospams.com','schafmail.de',
  'selfdestructingmail.com','senseless-entertainment.com','server.ms.selfip.net',
  'sharedmailbox.org','sharklasers.com','shieldemail.com','shiftmail.com',
  'shitmail.me','shortmail.net','shut.name','shut.ws','sibmail.com',
  'sinnlos-mail.de','siteposter.net','skeefmail.com','slaskpost.se',
  'slopsbox.com','slowslow.de','smashmail.de','smellfear.com','snakemail.com',
  'sneakemail.com','snkmail.com','sofimail.com','sofort-mail.de',
  'sogetthis.com','soisz.com','solvemail.info','soodonims.com',
  'spam.su','spam4.me','spamavert.com','spambob.com','spambob.net',
  'spambob.org','spambog.com','spambog.de','spambog.net','spambog.ru',
  'spambox.info','spambox.irishspringrealty.com','spambox.us','spamcannon.com',
  'spamcannon.net','spamcero.com','spamcon.org','spamcorptastic.com',
  'spamcowboy.com','spamcowboy.net','spamcowboy.org','spamday.com',
  'spamex.com','spamfighter.cf','spamfighter.ga','spamfighter.gq',
  'spamfighter.ml','spamfighter.tk','spamfree24.com','spamfree24.de',
  'spamfree24.eu','spamfree24.info','spamfree24.net','spamfree24.org',
  'spamgoes.in','spamherelots.com','spamhereplease.com','spamhole.com',
  'spamify.com','spaminator.de','spamkill.info','spaml.com','spaml.de',
  'spammotel.com','spamobox.com','spamoff.de','spamsalad.in','spamslicer.com',
  'spamspot.com','spamstack.net','spamthis.co.uk','spamthisplease.com',
  'spamtrail.com','spamtroll.net','speed.1s.fr','spoofmail.de','squizzy.de',
  'ssoia.com','startkeys.com','stinkefinger.net','stop-my-spam.cf',
  'stop-my-spam.com','stop-my-spam.ga','stop-my-spam.ml','stop-my-spam.tk',
  'streetwisemail.com','stuffmail.de','supergreatmail.com','supermailer.jp',
  'superrito.com','superstachel.de','suremail.info','svk.jp','sweetxxx.de',
  'tagyourself.com','talkinator.com','tapchicuoihoi.com','teewars.org',
  'teleworm.com','teleworm.us','temp-mail.de','temp-mail.ru','temp.emeraldwebmail.com',
  'tempail.com','tempalias.com','tempe-mail.com','tempemail.biz',
  'tempemail.co.za','tempemail.com','tempemail.net','tempinbox.co.uk',
  'tempinbox.com','tempmail.co','tempmail.de','tempmail.eu','tempmail.it',
  'tempmail.net','tempmail.us','tempmail2.com','tempmaildemo.com',
  'tempmailer.com','tempmailer.de','tempmails.co','tempmails.com',
  'tempmails.net','tempmailz.info','tempomail.fr','temporarioemail.com.br',
  'temporaryemail.net','temporaryemail.us','temporaryforwarding.com',
  'temporaryinbox.com','tempthe.net','thankyou2010.com','thc.st',
  'thelimestones.com','thisisnotmyrealemail.com','thismail.net','thismail.ru',
  'throam.com','throwam.com','throwawayemailaddress.com','throwawaymail.com',
  'tilien.com','tittbit.in','tmailinator.com','tmail.ws','tmpmail.org',
  'tmpmail.net','toiea.com','tokenmail.de','toomail.biz','topranklist.de',
  'tradermail.info','trash-amil.com','trash-mail.at','trash-mail.com',
  'trash-mail.de','trash2009.com','trashemail.de','trashmail.at',
  'trashmail.com','trashmail.de','trashmail.io','trashmail.me',
  'trashmail.net','trashmail.org','trashmail.ws','trashmailer.com',
  'trashymail.com','trbvm.com','trickmail.net','trillianpro.com',
  'tryalert.com','turual.com','twinmail.de','twoweirdtricks.com',
  'tyldd.com','uggsrock.com','upliftnow.com','uplipht.com','uroid.com',
  'us.af','valemail.net','venompen.com','veryrealemail.com',
  'viditag.com','viralplays.com','vkcode.ru','vomoto.com',
  'vpn.st','vsimcard.com','vubby.com','wasteland.rfc822.org',
  'webemail.me','webm4il.info','webtrip.ch','wegwerf-email.de',
  'wegwerfadresse.de','wegwerfemail.de','wegwerfemail.net','wegwerfemail.org',
  'wetrainbayarea.com','wetrainbayarea.org','wh4f.org','whatiaas.com',
  'whatpaas.com','whopy.com','whyspam.me','wilemail.com',
  'willhackforfood.biz','willselfdestruct.com','winemaven.info',
  'wolfsmail.tk','wollan.info','worldspace.link','wronghead.com',
  'wuzup.net','wuzupmail.net','wwwnew.eu','xagloo.com',
  'xemaps.com','xents.com','xmaily.com','xoxy.net',
  'yapped.net','yeah.net','yep.it','yogamaven.com',
  'yopmail.com','yopmail.fr','yopmail.net','you-spam.com',
  'yourdomain.com','ypmail.webarnak.fr','yuurok.com','z1p.biz',
  'za.com','zehnminuten.de','zehnminutenmail.de','zippymail.info',
  'zoaxe.com','zoemail.com','zoemail.net','zoemail.org','zomg.info','zxcv.com','zxcvbnm.com','zzz.com'
]);

export async function handleSignup(request, env, corsHeaders) {
  try {
    const { email, password } = await request.json();

    // 基础校验
    if (!email || !password || password.length < 6) {
      return jsonResp({ error: '邮箱或密码格式不正确' }, 400, corsHeaders);
    }
    
    const domain = (email.split('@')[1] || '').toLowerCase();
    if (!domain) {
      return jsonResp({ error: '邮箱格式错误' }, 400, corsHeaders);
    }

    // 一次性邮箱黑名单
    if (DISPOSABLE.has(domain)) {
      return jsonResp({ error: '不支持临时邮箱注册' }, 400, corsHeaders);
    }

    // MX 记录检查
    try {
      const mxRes = await fetch(`https://dns.alidns.com/resolve?name=${encodeURIComponent(domain)}&type=MX`, {
        headers: { 'accept': 'application/dns-json' },
        cf: { cacheTtl: 3600 }
      });
      const mxData = await mxRes.json();
      const hasMX = mxData.Status === 0 && Array.isArray(mxData.Answer) && mxData.Answer.some(a => a.type === 15);
      if (!hasMX) {
        return jsonResp({ error: '邮箱域名无效，请检查拼写' }, 400, corsHeaders);
      }
    } catch {
      // MX 检查失败时放过，避免因 DNS 查询超时阻断正常注册
    }

    // 代理到 Supabase Auth
    const supabaseRes = await fetch(`${env.SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    const supabaseData = await supabaseRes.json();

    if (!supabaseRes.ok) {
      return jsonResp({ error: supabaseData.msg || supabaseData.message || '注册失败' }, 400, corsHeaders);
    }

    return jsonResp({ success: true, message: '验证邮件已发送，请查收' }, 200, corsHeaders);
  } catch {
    return jsonResp({ error: '服务器错误' }, 500, corsHeaders);
  }
}