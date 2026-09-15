import { isSupabaseConfigured } from "./supabase";
import { localProfileRepository } from "./profile";
import type { ProfileRepository } from "./profile";
import { supabaseProfileRepository } from "./supabase/profile";

/**
 * Выбор реализации репозитория профиля.
 *
 * Настроен Supabase → облако; иначе → localStorage. Единственное место,
 * где принимается это решение, поэтому переключение режима не требует правок
 * ни в сторах, ни в компонентах.
 */
export const profileRepository: ProfileRepository = isSupabaseConfigured
  ? supabaseProfileRepository
  : localProfileRepository;
