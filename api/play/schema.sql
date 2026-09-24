-- ============================================================================
--  GooseHost · 广场（Playground）建表脚本
--  所有表统一 gh_play_ 前缀
--  执行位置：Supabase 控制台 → SQL Editor（以 postgres 角色执行）
--  幂等：全部使用 if not exists / drop ... if exists，可重复执行
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. gh_play_profile —— 广场用户资料（昵称 / 头像 / 简介 / 计数）
-- ============================================================================
create table if not exists public.gh_play_profile (
    id              uuid primary key references auth.users(id) on delete cascade,
    nickname        text        not null default '',
    avatar_url      text,                                  -- 头像（用户填 URL）
    bio             text        not null default '',        -- 一句话简介
    post_count      integer     not null default 0,
    follower_count  integer     not null default 0,
    following_count integer     not null default 0,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint gh_play_profile_nick_len check (char_length(nickname) <= 20),
    constraint gh_play_profile_bio_len  check (char_length(bio)      <= 200)
);

comment on table  public.gh_play_profile is '广场用户资料';
comment on column public.gh_play_profile.avatar_url is '头像 URL，由用户在广场设置页填写';

-- ============================================================================
-- 2. gh_play_post —— 广场帖子（kind = site 站点发布 / text 纯帖子）
-- ============================================================================
create table if not exists public.gh_play_post (
    id             uuid primary key default gen_random_uuid(),
    author_id      uuid        not null references auth.users(id) on delete cascade,
    kind           text        not null default 'text'
                   check (kind in ('site', 'text')),
    title          text        not null,
    content        text        not null default '',   -- 正文 / 站点介绍
    site_slug      text,                              -- kind='site' 时对应 gh_site.name
    site_url       text,                              -- 站点访问地址快照
    preview_url    text,                              -- 网页首屏预览图（先占位，等抓取服务）
    preview_status text        not null default 'none'
                   check (preview_status in ('none', 'pending', 'ready', 'failed')),
    like_count     integer     not null default 0,
    comment_count  integer     not null default 0,
    view_count     integer     not null default 0,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    -- 站点帖必须带站点信息；纯帖不允许带
    constraint gh_play_post_site_chk check (
        (kind = 'site' and site_slug is not null and length(site_slug) > 0)
        or
        (kind = 'text' and site_slug is null)
    ),
    constraint gh_play_post_title_len  check (char_length(title)   between 1 and 120),
    constraint gh_play_post_content_len check (char_length(content) <= 20000)
);

create index if not exists idx_gh_play_post_created  on public.gh_play_post (created_at desc);
create index if not exists idx_gh_play_post_author   on public.gh_play_post (author_id, created_at desc);
create index if not exists idx_gh_play_post_kind     on public.gh_play_post (kind, created_at desc);
create index if not exists idx_gh_play_post_hot      on public.gh_play_post (like_count desc, created_at desc);
create index if not exists idx_gh_play_post_slug     on public.gh_play_post (site_slug) where site_slug is not null;

-- ============================================================================
-- 3. gh_play_comment —— 多级评论（parent_id 自引用，path 保证树形排序）
--    author_id 为空 = AI（小鹅C）回复
-- ============================================================================
create table if not exists public.gh_play_comment (
    id          uuid primary key default gen_random_uuid(),
    post_id     uuid        not null references public.gh_play_post(id) on delete cascade,
    author_id   uuid        references auth.users(id) on delete set null,  -- null = 小鹅C
    parent_id   uuid        references public.gh_play_comment(id) on delete cascade,
    root_id     uuid,                                   -- 顶层评论 id，便于分页
    path        text        collate "C" not null,        -- 形如 <seg>/<seg>，C 排序规则保证树形时间序
    depth       integer     not null default 0,
    content     text        not null,
    is_ai       boolean     not null default false,      -- 是否小鹅C 的回复
    mention_ai  boolean     not null default false,      -- 本条是否 @ 了小鹅C
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    constraint gh_play_comment_content_len check (char_length(content) between 1 and 5000)
);

create index if not exists idx_gh_play_comment_post   on public.gh_play_comment (post_id, path);
create index if not exists idx_gh_play_comment_root   on public.gh_play_comment (root_id);
create index if not exists idx_gh_play_comment_author on public.gh_play_comment (author_id, created_at desc);

-- ============================================================================
-- 4. gh_play_like —— 帖子点赞（每人每帖一条）
-- ============================================================================
create table if not exists public.gh_play_like (
    post_id    uuid        not null references public.gh_play_post(id) on delete cascade,
    user_id    uuid        not null references auth.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (post_id, user_id)
);

create index if not exists idx_gh_play_like_user on public.gh_play_like (user_id, created_at desc);

-- ============================================================================
-- 5. gh_play_follow —— 关注关系
-- ============================================================================
create table if not exists public.gh_play_follow (
    follower_id  uuid        not null references auth.users(id) on delete cascade,
    following_id uuid        not null references auth.users(id) on delete cascade,
    created_at   timestamptz not null default now(),
    primary key (follower_id, following_id),
    constraint gh_play_follow_no_self check (follower_id <> following_id)
);

create index if not exists idx_gh_play_follow_follower  on public.gh_play_follow (follower_id, created_at desc);
create index if not exists idx_gh_play_follow_following on public.gh_play_follow (following_id, created_at desc);

-- ============================================================================
-- 6. 计数器维护（触发器，SECURITY DEFINER 绕过 RLS）
-- ============================================================================

create or replace function public.gh_play_tg_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists trg_gh_play_profile_updated on public.gh_play_profile;
create trigger trg_gh_play_profile_updated before update on public.gh_play_profile
    for each row execute function public.gh_play_tg_updated_at();

drop trigger if exists trg_gh_play_post_updated on public.gh_play_post;
create trigger trg_gh_play_post_updated before update on public.gh_play_post
    for each row execute function public.gh_play_tg_updated_at();

drop trigger if exists trg_gh_play_comment_updated on public.gh_play_comment;
create trigger trg_gh_play_comment_updated before update on public.gh_play_comment
    for each row execute function public.gh_play_tg_updated_at();

-- ---- 点赞数 ----
create or replace function public.gh_play_sync_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if (tg_op = 'INSERT') then
        update public.gh_play_post set like_count = greatest(like_count + 1, 0) where id = new.post_id;
    elsif (tg_op = 'DELETE') then
        update public.gh_play_post set like_count = greatest(like_count - 1, 0) where id = old.post_id;
    end if;
    return null;
end;
$$;

drop trigger if exists trg_gh_play_like_count on public.gh_play_like;
create trigger trg_gh_play_like_count
after insert or delete on public.gh_play_like
    for each row execute function public.gh_play_sync_like_count();

-- ---- 评论数 ----
create or replace function public.gh_play_sync_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if (tg_op = 'INSERT') then
        update public.gh_play_post set comment_count = greatest(comment_count + 1, 0) where id = new.post_id;
    elsif (tg_op = 'DELETE') then
        update public.gh_play_post set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
    end if;
    return null;
end;
$$;

drop trigger if exists trg_gh_play_comment_count on public.gh_play_comment;
create trigger trg_gh_play_comment_count
after insert or delete on public.gh_play_comment
    for each row execute function public.gh_play_sync_comment_count();

-- ---- 发帖数 ----
create or replace function public.gh_play_sync_post_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if (tg_op = 'INSERT') then
        insert into public.gh_play_profile (id) values (new.author_id)
        on conflict (id) do update set post_count = gh_play_profile.post_count + 1;
    elsif (tg_op = 'DELETE') then
        update public.gh_play_profile
           set post_count = greatest(post_count - 1, 0)
         where id = old.author_id;
    end if;
    return null;
end;
$$;

drop trigger if exists trg_gh_play_post_count on public.gh_play_post;
create trigger trg_gh_play_post_count
after insert or delete on public.gh_play_post
    for each row execute function public.gh_play_sync_post_count();

-- ---- 粉丝 / 关注数 ----
create or replace function public.gh_play_sync_follow_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if (tg_op = 'INSERT') then
        insert into public.gh_play_profile (id) values (new.follower_id)
        on conflict (id) do update set following_count = gh_play_profile.following_count + 1;
        insert into public.gh_play_profile (id) values (new.following_id)
        on conflict (id) do update set follower_count = gh_play_profile.follower_count + 1;
    elsif (tg_op = 'DELETE') then
        update public.gh_play_profile set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
        update public.gh_play_profile set follower_count  = greatest(follower_count  - 1, 0) where id = old.following_id;
    end if;
    return null;
end;
$$;

drop trigger if exists trg_gh_play_follow_count on public.gh_play_follow;
create trigger trg_gh_play_follow_count
after insert or delete on public.gh_play_follow
    for each row execute function public.gh_play_sync_follow_count();

-- ============================================================================
-- 7. 公共函数：浏览量 +1（供 Worker 用 service_role 调用）
-- ============================================================================
create or replace function public.gh_play_inc_view(p_post_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
    update public.gh_play_post set view_count = view_count + 1 where id = p_post_id;
$$;

-- ============================================================================
-- 8. RLS（后端走 service_role 会自动绕过；这里保证 anon key 直连时也不越权）
--    口径：帖子 / 评论 / 资料 / 点赞 / 关注 全部公开可读；写入只能操作自己的数据
-- ============================================================================
alter table public.gh_play_profile enable row level security;
alter table public.gh_play_post    enable row level security;
alter table public.gh_play_comment enable row level security;
alter table public.gh_play_like    enable row level security;
alter table public.gh_play_follow  enable row level security;

-- 资料
drop policy if exists "gh_play_profile_select_all"  on public.gh_play_profile;
create policy "gh_play_profile_select_all"  on public.gh_play_profile for select using (true);
drop policy if exists "gh_play_profile_insert_self" on public.gh_play_profile;
create policy "gh_play_profile_insert_self" on public.gh_play_profile for insert with check (auth.uid() = id);
drop policy if exists "gh_play_profile_update_self" on public.gh_play_profile;
create policy "gh_play_profile_update_self" on public.gh_play_profile for update using (auth.uid() = id) with check (auth.uid() = id);

-- 帖子
drop policy if exists "gh_play_post_select_all"    on public.gh_play_post;
create policy "gh_play_post_select_all"    on public.gh_play_post for select using (true);
drop policy if exists "gh_play_post_insert_self"   on public.gh_play_post;
create policy "gh_play_post_insert_self"   on public.gh_play_post for insert with check (auth.uid() = author_id);
drop policy if exists "gh_play_post_update_self"   on public.gh_play_post;
create policy "gh_play_post_update_self"   on public.gh_play_post for update using (auth.uid() = author_id) with check (auth.uid() = author_id);
drop policy if exists "gh_play_post_delete_self"   on public.gh_play_post;
create policy "gh_play_post_delete_self"   on public.gh_play_post for delete using (auth.uid() = author_id);

-- 评论（AI 评论 author_id 为空，由 service_role 写入，不经过此策略）
drop policy if exists "gh_play_comment_select_all"  on public.gh_play_comment;
create policy "gh_play_comment_select_all"  on public.gh_play_comment for select using (true);
drop policy if exists "gh_play_comment_insert_self" on public.gh_play_comment;
create policy "gh_play_comment_insert_self" on public.gh_play_comment for insert with check (auth.uid() = author_id);
drop policy if exists "gh_play_comment_update_self" on public.gh_play_comment;
create policy "gh_play_comment_update_self" on public.gh_play_comment for update using (auth.uid() = author_id) with check (auth.uid() = author_id);
drop policy if exists "gh_play_comment_delete_self" on public.gh_play_comment;
create policy "gh_play_comment_delete_self" on public.gh_play_comment for delete using (auth.uid() = author_id);

-- 点赞
drop policy if exists "gh_play_like_select_all"    on public.gh_play_like;
create policy "gh_play_like_select_all"    on public.gh_play_like for select using (true);
drop policy if exists "gh_play_like_insert_self"   on public.gh_play_like;
create policy "gh_play_like_insert_self"   on public.gh_play_like for insert with check (auth.uid() = user_id);
drop policy if exists "gh_play_like_delete_self"   on public.gh_play_like;
create policy "gh_play_like_delete_self"   on public.gh_play_like for delete using (auth.uid() = user_id);

-- 关注
drop policy if exists "gh_play_follow_select_all"  on public.gh_play_follow;
create policy "gh_play_follow_select_all"  on public.gh_play_follow for select using (true);
drop policy if exists "gh_play_follow_insert_self" on public.gh_play_follow;
create policy "gh_play_follow_insert_self" on public.gh_play_follow for insert with check (auth.uid() = follower_id);
drop policy if exists "gh_play_follow_delete_self" on public.gh_play_follow;
create policy "gh_play_follow_delete_self" on public.gh_play_follow for delete using (auth.uid() = follower_id);

-- ============================================================================
-- 9. 可选：为已有账号批量补一条空资料（跑一次即可）
-- ============================================================================
insert into public.gh_play_profile (id, nickname)
select u.id,
       left(coalesce(u.raw_user_meta_data->>'nickname', split_part(coalesce(u.email, ''), '@', 1)), 20)
from auth.users u
on conflict (id) do nothing;

-- ============================================================================
-- 10. 可选：一键清空广场数据（危险，调试用，默认注释）
-- ============================================================================
-- truncate public.gh_play_like, public.gh_play_follow, public.gh_play_comment,
--          public.gh_play_post, public.gh_play_profile restart identity cascade;
