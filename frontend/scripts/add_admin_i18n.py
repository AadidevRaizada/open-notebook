# -*- coding: utf-8 -*-
"""Inject navigation.admin + the adminPage section into all locale index.ts files.

The locales are TypeScript modules (`<locale>/index.ts`), not JSON. This script
inserts `admin` into the existing `navigation` object and adds a top-level
`adminPage` object as the first key. Idempotent: skips files that already have it.
"""
import re
from pathlib import Path

LOCALES = Path(__file__).resolve().parent.parent / "src" / "lib" / "locales"

# Fixed key order for the adminPage block.
KEY_ORDER = [
    "title", "description", "usersTab", "usageTab", "quickLinks",
    "userManagementUnavailable", "inviteSuccess", "inviteError", "actionSuccess",
    "actionError", "inviteTitle", "invitePlaceholder", "inviteButton",
    "pendingInvitations", "revokeSuccess", "revoke", "usersTitle", "roleAdmin",
    "roleMember", "banned", "you", "lastSignIn", "never", "removeAdmin",
    "makeAdmin", "unbanUser", "banUser", "deleteUser", "deleteConfirmTitle",
    "banConfirmTitle", "deleteConfirmDesc", "banConfirmDesc", "usageTitle",
    "usageEmpty", "usageTotal", "lastActive", "recentActivity",
]
ACTION_ORDER = [
    "sourceCreated", "noteCreated", "chatMessage", "search", "ask",
    "podcastGenerated", "transformationRun", "exportReport",
]

T = {}

T["en-US"] = {"nav": "Admin", "p": {
    "title": "Admin",
    "description": "Manage users and monitor usage across your workspace.",
    "usersTab": "Users", "usageTab": "Usage", "quickLinks": "Quick links:",
    "userManagementUnavailable": "User management is unavailable. Set CLERK_SECRET_KEY on the API server to enable it.",
    "inviteSuccess": "Invitation sent to {email}", "inviteError": "Failed to send invitation",
    "actionSuccess": "Done", "actionError": "Action failed",
    "inviteTitle": "Invite a user", "invitePlaceholder": "email@example.com",
    "inviteButton": "Send invite", "pendingInvitations": "Pending invitations",
    "revokeSuccess": "Invitation revoked", "revoke": "Revoke", "usersTitle": "Users",
    "roleAdmin": "Admin", "roleMember": "Member", "banned": "Banned", "you": "You",
    "lastSignIn": "Last sign-in", "never": "Never", "removeAdmin": "Remove admin",
    "makeAdmin": "Make admin", "unbanUser": "Unban user", "banUser": "Ban user",
    "deleteUser": "Delete user", "deleteConfirmTitle": "Delete user?",
    "banConfirmTitle": "Ban user?",
    "deleteConfirmDesc": "This permanently deletes {email}. This cannot be undone.",
    "banConfirmDesc": "This bans {email} from signing in. You can unban them later.",
    "usageTitle": "Usage by user", "usageEmpty": "No activity recorded yet.",
    "usageTotal": "Total", "lastActive": "Last active", "recentActivity": "Recent activity",
    "actions": {"sourceCreated": "Sources", "noteCreated": "Notes", "chatMessage": "Chat",
        "search": "Search", "ask": "Ask", "podcastGenerated": "Podcasts",
        "transformationRun": "Transformations", "exportReport": "Reports"}}}

T["de-DE"] = {"nav": "Admin", "p": {
    "title": "Admin",
    "description": "Verwalten Sie Benutzer und überwachen Sie die Nutzung in Ihrem Arbeitsbereich.",
    "usersTab": "Benutzer", "usageTab": "Nutzung", "quickLinks": "Schnellzugriff:",
    "userManagementUnavailable": "Benutzerverwaltung ist nicht verfügbar. Legen Sie CLERK_SECRET_KEY auf dem API-Server fest, um sie zu aktivieren.",
    "inviteSuccess": "Einladung an {email} gesendet", "inviteError": "Einladung konnte nicht gesendet werden",
    "actionSuccess": "Fertig", "actionError": "Aktion fehlgeschlagen",
    "inviteTitle": "Benutzer einladen", "invitePlaceholder": "email@example.com",
    "inviteButton": "Einladung senden", "pendingInvitations": "Ausstehende Einladungen",
    "revokeSuccess": "Einladung widerrufen", "revoke": "Widerrufen", "usersTitle": "Benutzer",
    "roleAdmin": "Admin", "roleMember": "Mitglied", "banned": "Gesperrt", "you": "Sie",
    "lastSignIn": "Letzte Anmeldung", "never": "Nie", "removeAdmin": "Admin entfernen",
    "makeAdmin": "Zum Admin machen", "unbanUser": "Sperre aufheben", "banUser": "Benutzer sperren",
    "deleteUser": "Benutzer löschen", "deleteConfirmTitle": "Benutzer löschen?",
    "banConfirmTitle": "Benutzer sperren?",
    "deleteConfirmDesc": "Dadurch wird {email} dauerhaft gelöscht. Dies kann nicht rückgängig gemacht werden.",
    "banConfirmDesc": "Dadurch wird {email} an der Anmeldung gehindert. Sie können die Sperre später aufheben.",
    "usageTitle": "Nutzung nach Benutzer", "usageEmpty": "Noch keine Aktivität aufgezeichnet.",
    "usageTotal": "Gesamt", "lastActive": "Zuletzt aktiv", "recentActivity": "Letzte Aktivität",
    "actions": {"sourceCreated": "Quellen", "noteCreated": "Notizen", "chatMessage": "Chat",
        "search": "Suche", "ask": "Fragen", "podcastGenerated": "Podcasts",
        "transformationRun": "Transformationen", "exportReport": "Berichte"}}}

T["es-ES"] = {"nav": "Admin", "p": {
    "title": "Administración",
    "description": "Gestiona usuarios y supervisa el uso en tu espacio de trabajo.",
    "usersTab": "Usuarios", "usageTab": "Uso", "quickLinks": "Enlaces rápidos:",
    "userManagementUnavailable": "La gestión de usuarios no está disponible. Configura CLERK_SECRET_KEY en el servidor de la API para habilitarla.",
    "inviteSuccess": "Invitación enviada a {email}", "inviteError": "No se pudo enviar la invitación",
    "actionSuccess": "Hecho", "actionError": "La acción falló",
    "inviteTitle": "Invitar a un usuario", "invitePlaceholder": "email@example.com",
    "inviteButton": "Enviar invitación", "pendingInvitations": "Invitaciones pendientes",
    "revokeSuccess": "Invitación revocada", "revoke": "Revocar", "usersTitle": "Usuarios",
    "roleAdmin": "Administrador", "roleMember": "Miembro", "banned": "Bloqueado", "you": "Tú",
    "lastSignIn": "Último inicio de sesión", "never": "Nunca", "removeAdmin": "Quitar administrador",
    "makeAdmin": "Hacer administrador", "unbanUser": "Desbloquear usuario", "banUser": "Bloquear usuario",
    "deleteUser": "Eliminar usuario", "deleteConfirmTitle": "¿Eliminar usuario?",
    "banConfirmTitle": "¿Bloquear usuario?",
    "deleteConfirmDesc": "Esto elimina permanentemente a {email}. No se puede deshacer.",
    "banConfirmDesc": "Esto impide que {email} inicie sesión. Puedes desbloquearlo más tarde.",
    "usageTitle": "Uso por usuario", "usageEmpty": "Aún no se ha registrado actividad.",
    "usageTotal": "Total", "lastActive": "Última actividad", "recentActivity": "Actividad reciente",
    "actions": {"sourceCreated": "Fuentes", "noteCreated": "Notas", "chatMessage": "Chat",
        "search": "Búsqueda", "ask": "Preguntar", "podcastGenerated": "Pódcasts",
        "transformationRun": "Transformaciones", "exportReport": "Informes"}}}

T["fr-FR"] = {"nav": "Admin", "p": {
    "title": "Administration",
    "description": "Gérez les utilisateurs et surveillez l'utilisation de votre espace de travail.",
    "usersTab": "Utilisateurs", "usageTab": "Utilisation", "quickLinks": "Liens rapides :",
    "userManagementUnavailable": "La gestion des utilisateurs est indisponible. Définissez CLERK_SECRET_KEY sur le serveur API pour l'activer.",
    "inviteSuccess": "Invitation envoyée à {email}", "inviteError": "Échec de l'envoi de l'invitation",
    "actionSuccess": "Terminé", "actionError": "Échec de l'action",
    "inviteTitle": "Inviter un utilisateur", "invitePlaceholder": "email@example.com",
    "inviteButton": "Envoyer l'invitation", "pendingInvitations": "Invitations en attente",
    "revokeSuccess": "Invitation révoquée", "revoke": "Révoquer", "usersTitle": "Utilisateurs",
    "roleAdmin": "Administrateur", "roleMember": "Membre", "banned": "Banni", "you": "Vous",
    "lastSignIn": "Dernière connexion", "never": "Jamais", "removeAdmin": "Retirer l'administrateur",
    "makeAdmin": "Nommer administrateur", "unbanUser": "Débannir l'utilisateur", "banUser": "Bannir l'utilisateur",
    "deleteUser": "Supprimer l'utilisateur", "deleteConfirmTitle": "Supprimer l'utilisateur ?",
    "banConfirmTitle": "Bannir l'utilisateur ?",
    "deleteConfirmDesc": "Cela supprime définitivement {email}. Cette action est irréversible.",
    "banConfirmDesc": "Cela empêche {email} de se connecter. Vous pourrez le débannir plus tard.",
    "usageTitle": "Utilisation par utilisateur", "usageEmpty": "Aucune activité enregistrée pour l'instant.",
    "usageTotal": "Total", "lastActive": "Dernière activité", "recentActivity": "Activité récente",
    "actions": {"sourceCreated": "Sources", "noteCreated": "Notes", "chatMessage": "Chat",
        "search": "Recherche", "ask": "Demander", "podcastGenerated": "Podcasts",
        "transformationRun": "Transformations", "exportReport": "Rapports"}}}

T["it-IT"] = {"nav": "Admin", "p": {
    "title": "Amministrazione",
    "description": "Gestisci gli utenti e monitora l'utilizzo del tuo spazio di lavoro.",
    "usersTab": "Utenti", "usageTab": "Utilizzo", "quickLinks": "Link rapidi:",
    "userManagementUnavailable": "La gestione utenti non è disponibile. Imposta CLERK_SECRET_KEY sul server API per abilitarla.",
    "inviteSuccess": "Invito inviato a {email}", "inviteError": "Invio dell'invito non riuscito",
    "actionSuccess": "Fatto", "actionError": "Azione non riuscita",
    "inviteTitle": "Invita un utente", "invitePlaceholder": "email@example.com",
    "inviteButton": "Invia invito", "pendingInvitations": "Inviti in sospeso",
    "revokeSuccess": "Invito revocato", "revoke": "Revoca", "usersTitle": "Utenti",
    "roleAdmin": "Amministratore", "roleMember": "Membro", "banned": "Bloccato", "you": "Tu",
    "lastSignIn": "Ultimo accesso", "never": "Mai", "removeAdmin": "Rimuovi amministratore",
    "makeAdmin": "Rendi amministratore", "unbanUser": "Sblocca utente", "banUser": "Blocca utente",
    "deleteUser": "Elimina utente", "deleteConfirmTitle": "Eliminare l'utente?",
    "banConfirmTitle": "Bloccare l'utente?",
    "deleteConfirmDesc": "Questo elimina definitivamente {email}. L'operazione non può essere annullata.",
    "banConfirmDesc": "Questo impedisce a {email} di accedere. Potrai sbloccarlo in seguito.",
    "usageTitle": "Utilizzo per utente", "usageEmpty": "Nessuna attività registrata finora.",
    "usageTotal": "Totale", "lastActive": "Ultima attività", "recentActivity": "Attività recente",
    "actions": {"sourceCreated": "Fonti", "noteCreated": "Note", "chatMessage": "Chat",
        "search": "Ricerca", "ask": "Chiedi", "podcastGenerated": "Podcast",
        "transformationRun": "Trasformazioni", "exportReport": "Report"}}}

T["ja-JP"] = {"nav": "管理", "p": {
    "title": "管理",
    "description": "ワークスペース全体のユーザーを管理し、利用状況を監視します。",
    "usersTab": "ユーザー", "usageTab": "利用状況", "quickLinks": "クイックリンク:",
    "userManagementUnavailable": "ユーザー管理は利用できません。有効にするには、APIサーバーで CLERK_SECRET_KEY を設定してください。",
    "inviteSuccess": "{email} に招待を送信しました", "inviteError": "招待の送信に失敗しました",
    "actionSuccess": "完了しました", "actionError": "操作に失敗しました",
    "inviteTitle": "ユーザーを招待", "invitePlaceholder": "email@example.com",
    "inviteButton": "招待を送信", "pendingInvitations": "保留中の招待",
    "revokeSuccess": "招待を取り消しました", "revoke": "取り消す", "usersTitle": "ユーザー",
    "roleAdmin": "管理者", "roleMember": "メンバー", "banned": "禁止済み", "you": "あなた",
    "lastSignIn": "最終サインイン", "never": "なし", "removeAdmin": "管理者を解除",
    "makeAdmin": "管理者にする", "unbanUser": "禁止を解除", "banUser": "ユーザーを禁止",
    "deleteUser": "ユーザーを削除", "deleteConfirmTitle": "ユーザーを削除しますか？",
    "banConfirmTitle": "ユーザーを禁止しますか？",
    "deleteConfirmDesc": "{email} を完全に削除します。この操作は元に戻せません。",
    "banConfirmDesc": "{email} のサインインを禁止します。後で解除できます。",
    "usageTitle": "ユーザー別の利用状況", "usageEmpty": "まだアクティビティは記録されていません。",
    "usageTotal": "合計", "lastActive": "最終アクティブ", "recentActivity": "最近のアクティビティ",
    "actions": {"sourceCreated": "ソース", "noteCreated": "ノート", "chatMessage": "チャット",
        "search": "検索", "ask": "質問", "podcastGenerated": "ポッドキャスト",
        "transformationRun": "変換", "exportReport": "レポート"}}}

T["pl-PL"] = {"nav": "Administrator", "p": {
    "title": "Administracja",
    "description": "Zarządzaj użytkownikami i monitoruj użycie w swoim obszarze roboczym.",
    "usersTab": "Użytkownicy", "usageTab": "Użycie", "quickLinks": "Szybkie linki:",
    "userManagementUnavailable": "Zarządzanie użytkownikami jest niedostępne. Ustaw CLERK_SECRET_KEY na serwerze API, aby je włączyć.",
    "inviteSuccess": "Zaproszenie wysłane do {email}", "inviteError": "Nie udało się wysłać zaproszenia",
    "actionSuccess": "Gotowe", "actionError": "Akcja nie powiodła się",
    "inviteTitle": "Zaproś użytkownika", "invitePlaceholder": "email@example.com",
    "inviteButton": "Wyślij zaproszenie", "pendingInvitations": "Oczekujące zaproszenia",
    "revokeSuccess": "Zaproszenie cofnięte", "revoke": "Cofnij", "usersTitle": "Użytkownicy",
    "roleAdmin": "Administrator", "roleMember": "Członek", "banned": "Zablokowany", "you": "Ty",
    "lastSignIn": "Ostatnie logowanie", "never": "Nigdy", "removeAdmin": "Usuń administratora",
    "makeAdmin": "Ustaw jako administratora", "unbanUser": "Odblokuj użytkownika", "banUser": "Zablokuj użytkownika",
    "deleteUser": "Usuń użytkownika", "deleteConfirmTitle": "Usunąć użytkownika?",
    "banConfirmTitle": "Zablokować użytkownika?",
    "deleteConfirmDesc": "Spowoduje to trwałe usunięcie {email}. Tej operacji nie można cofnąć.",
    "banConfirmDesc": "Uniemożliwi to {email} logowanie. Możesz go później odblokować.",
    "usageTitle": "Użycie według użytkownika", "usageEmpty": "Nie zarejestrowano jeszcze żadnej aktywności.",
    "usageTotal": "Razem", "lastActive": "Ostatnia aktywność", "recentActivity": "Ostatnia aktywność",
    "actions": {"sourceCreated": "Źródła", "noteCreated": "Notatki", "chatMessage": "Czat",
        "search": "Wyszukiwanie", "ask": "Zapytaj", "podcastGenerated": "Podcasty",
        "transformationRun": "Transformacje", "exportReport": "Raporty"}}}

T["pt-BR"] = {"nav": "Admin", "p": {
    "title": "Administração",
    "description": "Gerencie usuários e monitore o uso em todo o seu espaço de trabalho.",
    "usersTab": "Usuários", "usageTab": "Uso", "quickLinks": "Links rápidos:",
    "userManagementUnavailable": "O gerenciamento de usuários está indisponível. Defina CLERK_SECRET_KEY no servidor da API para habilitá-lo.",
    "inviteSuccess": "Convite enviado para {email}", "inviteError": "Falha ao enviar o convite",
    "actionSuccess": "Concluído", "actionError": "A ação falhou",
    "inviteTitle": "Convidar um usuário", "invitePlaceholder": "email@example.com",
    "inviteButton": "Enviar convite", "pendingInvitations": "Convites pendentes",
    "revokeSuccess": "Convite revogado", "revoke": "Revogar", "usersTitle": "Usuários",
    "roleAdmin": "Administrador", "roleMember": "Membro", "banned": "Banido", "you": "Você",
    "lastSignIn": "Último acesso", "never": "Nunca", "removeAdmin": "Remover administrador",
    "makeAdmin": "Tornar administrador", "unbanUser": "Desbanir usuário", "banUser": "Banir usuário",
    "deleteUser": "Excluir usuário", "deleteConfirmTitle": "Excluir usuário?",
    "banConfirmTitle": "Banir usuário?",
    "deleteConfirmDesc": "Isso exclui permanentemente {email}. Não é possível desfazer.",
    "banConfirmDesc": "Isso impede que {email} faça login. Você pode desbani-lo depois.",
    "usageTitle": "Uso por usuário", "usageEmpty": "Nenhuma atividade registrada ainda.",
    "usageTotal": "Total", "lastActive": "Última atividade", "recentActivity": "Atividade recente",
    "actions": {"sourceCreated": "Fontes", "noteCreated": "Notas", "chatMessage": "Chat",
        "search": "Busca", "ask": "Perguntar", "podcastGenerated": "Podcasts",
        "transformationRun": "Transformações", "exportReport": "Relatórios"}}}

T["ru-RU"] = {"nav": "Админ", "p": {
    "title": "Администрирование",
    "description": "Управляйте пользователями и отслеживайте использование в вашем рабочем пространстве.",
    "usersTab": "Пользователи", "usageTab": "Использование", "quickLinks": "Быстрые ссылки:",
    "userManagementUnavailable": "Управление пользователями недоступно. Задайте CLERK_SECRET_KEY на сервере API, чтобы включить его.",
    "inviteSuccess": "Приглашение отправлено на {email}", "inviteError": "Не удалось отправить приглашение",
    "actionSuccess": "Готово", "actionError": "Не удалось выполнить действие",
    "inviteTitle": "Пригласить пользователя", "invitePlaceholder": "email@example.com",
    "inviteButton": "Отправить приглашение", "pendingInvitations": "Ожидающие приглашения",
    "revokeSuccess": "Приглашение отозвано", "revoke": "Отозвать", "usersTitle": "Пользователи",
    "roleAdmin": "Администратор", "roleMember": "Участник", "banned": "Заблокирован", "you": "Вы",
    "lastSignIn": "Последний вход", "never": "Никогда", "removeAdmin": "Снять администратора",
    "makeAdmin": "Назначить администратором", "unbanUser": "Разблокировать пользователя", "banUser": "Заблокировать пользователя",
    "deleteUser": "Удалить пользователя", "deleteConfirmTitle": "Удалить пользователя?",
    "banConfirmTitle": "Заблокировать пользователя?",
    "deleteConfirmDesc": "Это навсегда удалит {email}. Отменить это действие нельзя.",
    "banConfirmDesc": "Это запретит {email} входить в систему. Позже вы сможете разблокировать.",
    "usageTitle": "Использование по пользователям", "usageEmpty": "Активность пока не зафиксирована.",
    "usageTotal": "Всего", "lastActive": "Последняя активность", "recentActivity": "Недавняя активность",
    "actions": {"sourceCreated": "Источники", "noteCreated": "Заметки", "chatMessage": "Чат",
        "search": "Поиск", "ask": "Вопрос", "podcastGenerated": "Подкасты",
        "transformationRun": "Преобразования", "exportReport": "Отчёты"}}}

T["tr-TR"] = {"nav": "Yönetici", "p": {
    "title": "Yönetim",
    "description": "Kullanıcıları yönetin ve çalışma alanınızdaki kullanımı izleyin.",
    "usersTab": "Kullanıcılar", "usageTab": "Kullanım", "quickLinks": "Hızlı bağlantılar:",
    "userManagementUnavailable": "Kullanıcı yönetimi kullanılamıyor. Etkinleştirmek için API sunucusunda CLERK_SECRET_KEY değerini ayarlayın.",
    "inviteSuccess": "{email} adresine davet gönderildi", "inviteError": "Davet gönderilemedi",
    "actionSuccess": "Tamamlandı", "actionError": "İşlem başarısız oldu",
    "inviteTitle": "Kullanıcı davet et", "invitePlaceholder": "email@example.com",
    "inviteButton": "Davet gönder", "pendingInvitations": "Bekleyen davetler",
    "revokeSuccess": "Davet iptal edildi", "revoke": "İptal et", "usersTitle": "Kullanıcılar",
    "roleAdmin": "Yönetici", "roleMember": "Üye", "banned": "Yasaklı", "you": "Siz",
    "lastSignIn": "Son oturum açma", "never": "Hiçbir zaman", "removeAdmin": "Yöneticiliği kaldır",
    "makeAdmin": "Yönetici yap", "unbanUser": "Yasağı kaldır", "banUser": "Kullanıcıyı yasakla",
    "deleteUser": "Kullanıcıyı sil", "deleteConfirmTitle": "Kullanıcı silinsin mi?",
    "banConfirmTitle": "Kullanıcı yasaklansın mı?",
    "deleteConfirmDesc": "Bu, {email} kullanıcısını kalıcı olarak siler. Bu işlem geri alınamaz.",
    "banConfirmDesc": "Bu, {email} kullanıcısının oturum açmasını engeller. Daha sonra yasağı kaldırabilirsiniz.",
    "usageTitle": "Kullanıcıya göre kullanım", "usageEmpty": "Henüz etkinlik kaydedilmedi.",
    "usageTotal": "Toplam", "lastActive": "Son etkin", "recentActivity": "Son etkinlik",
    "actions": {"sourceCreated": "Kaynaklar", "noteCreated": "Notlar", "chatMessage": "Sohbet",
        "search": "Arama", "ask": "Sor", "podcastGenerated": "Podcast'ler",
        "transformationRun": "Dönüşümler", "exportReport": "Raporlar"}}}

T["zh-CN"] = {"nav": "管理", "p": {
    "title": "管理",
    "description": "管理用户并监控整个工作区的使用情况。",
    "usersTab": "用户", "usageTab": "使用情况", "quickLinks": "快速链接：",
    "userManagementUnavailable": "用户管理不可用。请在 API 服务器上设置 CLERK_SECRET_KEY 以启用此功能。",
    "inviteSuccess": "邀请已发送至 {email}", "inviteError": "发送邀请失败",
    "actionSuccess": "完成", "actionError": "操作失败",
    "inviteTitle": "邀请用户", "invitePlaceholder": "email@example.com",
    "inviteButton": "发送邀请", "pendingInvitations": "待处理的邀请",
    "revokeSuccess": "邀请已撤销", "revoke": "撤销", "usersTitle": "用户",
    "roleAdmin": "管理员", "roleMember": "成员", "banned": "已封禁", "you": "你",
    "lastSignIn": "上次登录", "never": "从不", "removeAdmin": "移除管理员",
    "makeAdmin": "设为管理员", "unbanUser": "解除封禁", "banUser": "封禁用户",
    "deleteUser": "删除用户", "deleteConfirmTitle": "删除用户？",
    "banConfirmTitle": "封禁用户？",
    "deleteConfirmDesc": "这将永久删除 {email}。此操作无法撤销。",
    "banConfirmDesc": "这将禁止 {email} 登录。你可以稍后解除封禁。",
    "usageTitle": "按用户统计的使用情况", "usageEmpty": "尚未记录任何活动。",
    "usageTotal": "总计", "lastActive": "最后活跃", "recentActivity": "最近活动",
    "actions": {"sourceCreated": "来源", "noteCreated": "笔记", "chatMessage": "聊天",
        "search": "搜索", "ask": "提问", "podcastGenerated": "播客",
        "transformationRun": "转换", "exportReport": "报告"}}}

T["zh-TW"] = {"nav": "管理", "p": {
    "title": "管理",
    "description": "管理使用者並監控整個工作區的使用情況。",
    "usersTab": "使用者", "usageTab": "使用情況", "quickLinks": "快速連結：",
    "userManagementUnavailable": "使用者管理無法使用。請在 API 伺服器上設定 CLERK_SECRET_KEY 以啟用此功能。",
    "inviteSuccess": "邀請已傳送至 {email}", "inviteError": "傳送邀請失敗",
    "actionSuccess": "完成", "actionError": "操作失敗",
    "inviteTitle": "邀請使用者", "invitePlaceholder": "email@example.com",
    "inviteButton": "傳送邀請", "pendingInvitations": "待處理的邀請",
    "revokeSuccess": "邀請已撤銷", "revoke": "撤銷", "usersTitle": "使用者",
    "roleAdmin": "管理員", "roleMember": "成員", "banned": "已封鎖", "you": "你",
    "lastSignIn": "上次登入", "never": "從不", "removeAdmin": "移除管理員",
    "makeAdmin": "設為管理員", "unbanUser": "解除封鎖", "banUser": "封鎖使用者",
    "deleteUser": "刪除使用者", "deleteConfirmTitle": "刪除使用者？",
    "banConfirmTitle": "封鎖使用者？",
    "deleteConfirmDesc": "這將永久刪除 {email}。此操作無法復原。",
    "banConfirmDesc": "這將禁止 {email} 登入。你可以稍後解除封鎖。",
    "usageTitle": "依使用者統計的使用情況", "usageEmpty": "尚未記錄任何活動。",
    "usageTotal": "總計", "lastActive": "最後活躍", "recentActivity": "最近活動",
    "actions": {"sourceCreated": "來源", "noteCreated": "筆記", "chatMessage": "聊天",
        "search": "搜尋", "ask": "詢問", "podcastGenerated": "Podcast",
        "transformationRun": "轉換", "exportReport": "報告"}}}

T["bn-IN"] = {"nav": "অ্যাডমিন", "p": {
    "title": "অ্যাডমিন",
    "description": "আপনার ওয়ার্কস্পেস জুড়ে ব্যবহারকারীদের পরিচালনা করুন এবং ব্যবহার পর্যবেক্ষণ করুন।",
    "usersTab": "ব্যবহারকারী", "usageTab": "ব্যবহার", "quickLinks": "দ্রুত লিঙ্ক:",
    "userManagementUnavailable": "ব্যবহারকারী ব্যবস্থাপনা উপলব্ধ নয়। এটি সক্ষম করতে API সার্ভারে CLERK_SECRET_KEY সেট করুন।",
    "inviteSuccess": "{email}-এ আমন্ত্রণ পাঠানো হয়েছে", "inviteError": "আমন্ত্রণ পাঠাতে ব্যর্থ হয়েছে",
    "actionSuccess": "সম্পন্ন হয়েছে", "actionError": "কাজটি ব্যর্থ হয়েছে",
    "inviteTitle": "একজন ব্যবহারকারীকে আমন্ত্রণ জানান", "invitePlaceholder": "email@example.com",
    "inviteButton": "আমন্ত্রণ পাঠান", "pendingInvitations": "মুলতুবি আমন্ত্রণ",
    "revokeSuccess": "আমন্ত্রণ প্রত্যাহার করা হয়েছে", "revoke": "প্রত্যাহার করুন", "usersTitle": "ব্যবহারকারী",
    "roleAdmin": "অ্যাডমিন", "roleMember": "সদস্য", "banned": "নিষিদ্ধ", "you": "আপনি",
    "lastSignIn": "সর্বশেষ সাইন-ইন", "never": "কখনও নয়", "removeAdmin": "অ্যাডমিন সরান",
    "makeAdmin": "অ্যাডমিন করুন", "unbanUser": "নিষেধাজ্ঞা তুলে নিন", "banUser": "ব্যবহারকারীকে নিষিদ্ধ করুন",
    "deleteUser": "ব্যবহারকারী মুছুন", "deleteConfirmTitle": "ব্যবহারকারী মুছবেন?",
    "banConfirmTitle": "ব্যবহারকারীকে নিষিদ্ধ করবেন?",
    "deleteConfirmDesc": "এটি স্থায়ীভাবে {email} মুছে ফেলবে। এটি পূর্বাবস্থায় ফেরানো যাবে না।",
    "banConfirmDesc": "এটি {email}-কে সাইন ইন করা থেকে বিরত রাখবে। আপনি পরে নিষেধাজ্ঞা তুলে নিতে পারবেন।",
    "usageTitle": "ব্যবহারকারী অনুযায়ী ব্যবহার", "usageEmpty": "এখনও কোনো কার্যকলাপ রেকর্ড করা হয়নি।",
    "usageTotal": "মোট", "lastActive": "সর্বশেষ সক্রিয়", "recentActivity": "সাম্প্রতিক কার্যকলাপ",
    "actions": {"sourceCreated": "উৎস", "noteCreated": "নোট", "chatMessage": "চ্যাট",
        "search": "অনুসন্ধান", "ask": "জিজ্ঞাসা", "podcastGenerated": "পডকাস্ট",
        "transformationRun": "রূপান্তর", "exportReport": "রিপোর্ট"}}}

T["ca-ES"] = {"nav": "Admin", "p": {
    "title": "Administració",
    "description": "Gestiona els usuaris i supervisa l'ús del teu espai de treball.",
    "usersTab": "Usuaris", "usageTab": "Ús", "quickLinks": "Enllaços ràpids:",
    "userManagementUnavailable": "La gestió d'usuaris no està disponible. Configura CLERK_SECRET_KEY al servidor de l'API per activar-la.",
    "inviteSuccess": "Invitació enviada a {email}", "inviteError": "No s'ha pogut enviar la invitació",
    "actionSuccess": "Fet", "actionError": "L'acció ha fallat",
    "inviteTitle": "Convida un usuari", "invitePlaceholder": "email@example.com",
    "inviteButton": "Envia la invitació", "pendingInvitations": "Invitacions pendents",
    "revokeSuccess": "Invitació revocada", "revoke": "Revoca", "usersTitle": "Usuaris",
    "roleAdmin": "Administrador", "roleMember": "Membre", "banned": "Bloquejat", "you": "Tu",
    "lastSignIn": "Últim inici de sessió", "never": "Mai", "removeAdmin": "Treu administrador",
    "makeAdmin": "Fes administrador", "unbanUser": "Desbloqueja l'usuari", "banUser": "Bloqueja l'usuari",
    "deleteUser": "Elimina l'usuari", "deleteConfirmTitle": "Voleu eliminar l'usuari?",
    "banConfirmTitle": "Voleu bloquejar l'usuari?",
    "deleteConfirmDesc": "Això elimina permanentment {email}. No es pot desfer.",
    "banConfirmDesc": "Això impedeix que {email} iniciï sessió. El podràs desbloquejar més endavant.",
    "usageTitle": "Ús per usuari", "usageEmpty": "Encara no s'ha registrat cap activitat.",
    "usageTotal": "Total", "lastActive": "Última activitat", "recentActivity": "Activitat recent",
    "actions": {"sourceCreated": "Fonts", "noteCreated": "Notes", "chatMessage": "Xat",
        "search": "Cerca", "ask": "Pregunta", "podcastGenerated": "Podcasts",
        "transformationRun": "Transformacions", "exportReport": "Informes"}}}


def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def build_admin_block(p: dict) -> str:
    lines = ["  adminPage: {"]
    for k in KEY_ORDER:
        lines.append(f'    {k}: "{esc(p[k])}",')
    lines.append("    actions: {")
    for a in ACTION_ORDER:
        lines.append(f'      {a}: "{esc(p["actions"][a])}",')
    lines.append("    },")
    lines.append("  },")
    return "\n".join(lines) + "\n"


def main():
    changed = []
    for locale, data in T.items():
        path = LOCALES / locale / "index.ts"
        if not path.exists():
            print(f"MISSING FILE: {path}")
            continue
        text = path.read_text(encoding="utf-8")
        if "adminPage:" in text:
            print(f"SKIP (already present): {locale}")
            continue

        # 1) adminPage block as first top-level key.
        block = build_admin_block(data["p"])
        new_text, n = re.subn(
            r"(export const \w+ = \{\r?\n)",
            lambda m: m.group(1) + block,
            text,
            count=1,
        )
        if n != 1:
            print(f"ERROR: could not find export const in {locale}")
            continue

        # 2) navigation.admin inside the existing navigation object.
        nav_line = f'    admin: "{esc(data["nav"])}",\n'
        new_text, n2 = re.subn(
            r"(\n  navigation: \{\r?\n)",
            lambda m: m.group(1) + nav_line,
            new_text,
            count=1,
        )
        if n2 != 1:
            print(f"ERROR: could not find navigation block in {locale}")
            continue

        path.write_text(new_text, encoding="utf-8")
        changed.append(locale)
        print(f"OK: {locale}")

    print(f"\nUpdated {len(changed)} locale(s): {', '.join(changed)}")


if __name__ == "__main__":
    main()
