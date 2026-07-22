// ===== 一次性邮箱黑名单 =====

const BLOCKED_DOMAINS = [
  'text.com', 'tempmail.com', 'guerrillamail.com', 'mailinator.com',
  'throwaway.email', 'temp-mail.org', 'fakeinbox.com', 'trashmail.com',
  'mailnesia.com', 'tempr.email', 'dispostable.com', 'maildrop.cc',
  'getnada.com', 'yopmail.com', 'sharklasers.com', 'mailcatch.com',
  '10minutemail.com', '10minutemail.net', '20minutemail.com',
  'mailforspam.com', 'incognitomail.com', 'tempail.com',
  'emailondeck.com', 'mintemail.com', 'getairmail.com',
];

function isDisposableEmail(email) {
  const emailDomain = email.split('@')[1] || '';
  return BLOCKED_DOMAINS.some(d => emailDomain === d || emailDomain.endsWith('.' + d));
}

export { BLOCKED_DOMAINS, isDisposableEmail };
