import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, BOARD_EMAIL } from './config.js?v=2';

export const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const sb = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const BUCKET = 'photos';
const URL_TTL_SECONDS = 6 * 60 * 60;

function check({ data, error }) {
  if (error) throw error;
  return data;
}

export async function getSession() {
  return check(await sb.auth.getSession()).session;
}

export function onAuthChange(callback) {
  // Supabase warns against awaiting other client calls inside this callback, so defer.
  sb.auth.onAuthStateChange((_event, session) => setTimeout(() => callback(session), 0));
}

export async function signIn(password) {
  try {
    check(await sb.auth.signInWithPassword({ email: BOARD_EMAIL, password }));
  } catch (err) {
    const wrong = err?.code === 'invalid_credentials' || /invalid login credentials/i.test(err?.message);
    throw wrong ? new Error("That password isn't right.") : err;
  }
}

export async function signOut() {
  await sb.auth.signOut();
}

async function attachUrls(photos) {
  if (!photos.length) return photos;
  const signed = check(
    await sb.storage.from(BUCKET).createSignedUrls(photos.map((p) => p.storage_path), URL_TTL_SECONDS),
  );
  const byPath = new Map(signed.map((s) => [s.path, s.signedUrl]));
  for (const p of photos) p.url = byPath.get(p.storage_path);
  return photos;
}

export async function loadBoard() {
  const [photos, comments, markings] = await Promise.all([
    sb.from('photos').select('*').order('created_at', { ascending: false }).then(check),
    sb.from('comments').select('*').order('created_at').then(check),
    sb.from('markings').select('*').order('created_at').then(check),
  ]);
  await attachUrls(photos);
  return { photos, comments, markings };
}

export async function loadPhotoExtras(photoId) {
  const [photo, comments, markings] = await Promise.all([
    sb.from('photos').select('*').eq('id', photoId).maybeSingle().then(check),
    sb.from('comments').select('*').eq('photo_id', photoId).order('created_at').then(check),
    sb.from('markings').select('*').eq('photo_id', photoId).order('created_at').then(check),
  ]);
  return { photo, comments, markings };
}

export async function uploadPhoto(blob, originalName, addedBy) {
  const path = `${crypto.randomUUID()}.jpg`;
  check(await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' }));
  try {
    const row = check(
      await sb.from('photos').insert({ storage_path: path, original_name: originalName, added_by_name: addedBy }).select().single(),
    );
    return (await attachUrls([row]))[0];
  } catch (err) {
    await sb.storage.from(BUCKET).remove([path]);
    throw err;
  }
}

export async function updateTags(photoId, tags) {
  return check(await sb.from('photos').update({ tags }).eq('id', photoId).select().single());
}

export async function deletePhoto(photo) {
  // Row first: a leftover file is harmless, a row pointing at a missing file is a broken card.
  const deleted = check(await sb.from('photos').delete().eq('id', photo.id).select('id'));
  if (!deleted.length) throw new Error('Photo was already removed.');
  await sb.storage.from(BUCKET).remove([photo.storage_path]);
}

export async function addComment(photoId, body, authorName) {
  return check(await sb.from('comments').insert({ photo_id: photoId, body, author_name: authorName }).select().single());
}

export async function deleteComment(commentId) {
  const deleted = check(await sb.from('comments').delete().eq('id', commentId).select('id'));
  if (!deleted.length) throw new Error('Comment was already removed.');
}

export async function addMarking(photoId, shape, authorName) {
  return check(await sb.from('markings').insert({ photo_id: photoId, shape, author_name: authorName }).select().single());
}

export async function deleteMarkings(ids) {
  const deleted = check(await sb.from('markings').delete().in('id', ids).select('id'));
  if (deleted.length !== ids.length) throw new Error('Some markings could not be removed.');
}
