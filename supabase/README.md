# Setup Database

Jalankan berurutan di Supabase SQL Editor atau menggunakan `node scripts/run-migrations.mjs`:

1. `migrations/0001_schema.sql` — skema dasar & index
2. `migrations/0002_seed.sql` — data awal site & kategori
3. `migrations/0003_triggers.sql` — nomor tiket otomatis & SLA
4. `migrations/0004_access_policies.sql` — kebijakan RLS berdasarkan akun dan peran
5. `migrations/0005_telegram_polling.sql` — state polling dan tautan Telegram sekali pakai
6. `migrations/0006_telegram_notification_deliveries.sql` — pencatatan dan deduplikasi pengiriman notifikasi
7. `migrations/0007_sla_and_autoclose.sql` — notifikasi SLA dan auto-close otomatis
8. `migrations/0008_auto_close_atomic.sql` — penutupan tiket dan event secara atomik
9. `migrations/0009_ticket_attachments_storage.sql` — bucket privat dan RLS lampiran gambar tiket
10. `migrations/0010_server_validated_attachment_upload.sql` — batasi upload lewat endpoint server tervalidasi
11. `migrations/0011_user_ticket_rating.sql` — tutup tiket oleh pembuat dengan rating dan event atomik
12. `migrations/0012_public_tickets.sql` — identitas pembuat publik dan token akses privat
13. `migrations/0013_public_ticket_rating.sql` — penutupan tiket publik dengan rating atomik
14. `migrations/0014_remove_kota_baru_site.sql` — hapus site Kota Baru dengan aman
15. `migrations/0015_replace_sleman_schedule.sql` — fungsi atomik pengganti jadwal kunjungan
16. `migrations/0016_route_sleman_tickets.sql` — routing awal Sleman
17. `migrations/0017_vpn_status_sleman_reminders.sql` — jumlah task VPN, status IT otomatis, routing kunjungan atomik
18. `migrations/0018_active_ticket_board_and_solution.sql` — validasi poin kesulitan dan catatan solusi
19. `migrations/0019_restrict_ticket_event_reads.sql` — batasi pembacaan timeline tiket
20. `migrations/0020_debito_jogja_core_and_sla.sql` — konsolidasi site tunggal `Debito Jogja` (400 user), pengelompokan kategori (`grup`), tabel `settings`, SLA hari kerja P3, validasi prioritas penuh di DB, pause/resume SLA, queue aging, dan auto-close sesuai target SLA
21. `migrations/0021_remote_credentials_and_security.sql` — pembatasan akses `foto_remote`, pencatatan audit `kredensial_dilihat`, pembersihan password terenkripsi saat selesai, dan RPC kontrol status IT manual
22. `migrations/0022_wiki_and_ticket_merge.sql` — tabel `knowledge_articles` (trigger `search_vector` full-text search), RPC `merge_tickets`, dan sinkronisasi penyelesaian tiket anak
23. `migrations/0023_sleman_hardening.sql` — tabel deduplikasi pengingat jadwal `schedule_reminder_deliveries`
24. `migrations/0024_assets_approval_multichannel.sql` — inventaris `assets`, deteksi RAM & alur approval, serta `push_subscriptions` & `notification_logs`
25. `migrations/0025_deactivate_non_jogja_sites.sql` — menonaktifkan site selain `Debito Jogja` (`aktif = false`) agar form publik fokus pada satu entitas site
26. `migrations/0026_add_ga_user_role.sql` — memperluas constraint `users_peran_check` untuk mendukung peran `ga`
27. `migrations/0027_revamp_categories_daily_report.sql` — revamp 19 kategori IT sesuai Daily Ticket Report Debito Jogja ke 6 kelompok + tambah kategori Kabel Power & Headset + nonaktifkan 3 duplikat 0-tiket
28. `migrations/0028_sparepart_stock_and_auto_procurement.sql` — tabel `inventory_stocks` & `stock_movements`, auto-pengadaan bulan depan saat stok = 0 di `init_ticket_asset_and_approval()`, event log, RLS, dan RPC atomik `adjust_inventory_stock()`
29. `migrations/0029_harden_stock_rpc_permissions.sql` — pencabutan izin `anon`/`PUBLIC` dan penegasan guard `service_role`/`authenticated` pada RPC stok & trigger log
