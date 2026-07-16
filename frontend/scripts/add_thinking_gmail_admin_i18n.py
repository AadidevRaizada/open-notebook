"""
Inject i18n keys for two features into every locale:

1. searchPage.thinking.* — phase status shown while an Ask answer is in flight
   ("Thinking…", "Formulating a strategy…", …) that replaced the intermediate
   strategy/answer display.
2. gmail.admin* — the admin "Connected Mail" overview of every connected Gmail
   account, plus adminPage.connectionsTab for its tab label.

Idempotent: re-running skips files that already contain the new keys.

Anchors (all unique, present in every locale thanks to parity):
- searchPage.thinking block inserted after the `processingQuestion:` line.
- gmail.admin* keys inserted after the `connectErrorToast:` line.
- adminPage.connectionsTab inserted after the `usageTab:` line.
"""

import os

LOCALES_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "lib", "locales")

# key -> per-locale string. "…" ellipsis, {count} placeholder for counts.
T = {
    "en-US": {
        "thinking": "Thinking…",
        "strategizing": "Formulating a strategy…",
        "searching": "Searching your sources…",
        "readingEmails": "Reading your emails…",
        "composing": "Composing your answer…",
        "adminTitle": "Connected Gmail Accounts",
        "adminDesc": "Every Gmail account your users have connected. Read-only metadata — you can't read anyone's mail from here.",
        "adminUser": "User",
        "adminEmail": "Gmail Account",
        "adminLastChecked": "Last checked",
        "adminCount": "{count} connected",
        "adminNone": "No Gmail accounts are connected yet.",
        "connectionsTab": "Connected Mail",
    },
    "es-ES": {
        "thinking": "Pensando…",
        "strategizing": "Formulando una estrategia…",
        "searching": "Buscando en tus fuentes…",
        "readingEmails": "Leyendo tus correos…",
        "composing": "Redactando tu respuesta…",
        "adminTitle": "Cuentas de Gmail conectadas",
        "adminDesc": "Todas las cuentas de Gmail que tus usuarios han conectado. Metadatos de solo lectura: no puedes leer el correo de nadie desde aquí.",
        "adminUser": "Usuario",
        "adminEmail": "Cuenta de Gmail",
        "adminLastChecked": "Última comprobación",
        "adminCount": "{count} conectadas",
        "adminNone": "Aún no hay cuentas de Gmail conectadas.",
        "connectionsTab": "Correo conectado",
    },
    "fr-FR": {
        "thinking": "Réflexion…",
        "strategizing": "Élaboration d'une stratégie…",
        "searching": "Recherche dans vos sources…",
        "readingEmails": "Lecture de vos e-mails…",
        "composing": "Rédaction de votre réponse…",
        "adminTitle": "Comptes Gmail connectés",
        "adminDesc": "Tous les comptes Gmail que vos utilisateurs ont connectés. Métadonnées en lecture seule — vous ne pouvez lire les messages de personne ici.",
        "adminUser": "Utilisateur",
        "adminEmail": "Compte Gmail",
        "adminLastChecked": "Dernière vérification",
        "adminCount": "{count} connectés",
        "adminNone": "Aucun compte Gmail n'est encore connecté.",
        "connectionsTab": "Messagerie connectée",
    },
    "de-DE": {
        "thinking": "Denke nach…",
        "strategizing": "Strategie wird entwickelt…",
        "searching": "Ihre Quellen werden durchsucht…",
        "readingEmails": "Ihre E-Mails werden gelesen…",
        "composing": "Antwort wird verfasst…",
        "adminTitle": "Verbundene Gmail-Konten",
        "adminDesc": "Alle Gmail-Konten, die Ihre Benutzer verbunden haben. Nur-Lese-Metadaten – Sie können hier niemandes E-Mails lesen.",
        "adminUser": "Benutzer",
        "adminEmail": "Gmail-Konto",
        "adminLastChecked": "Zuletzt geprüft",
        "adminCount": "{count} verbunden",
        "adminNone": "Es sind noch keine Gmail-Konten verbunden.",
        "connectionsTab": "Verbundene E-Mail",
    },
    "pt-BR": {
        "thinking": "Pensando…",
        "strategizing": "Formulando uma estratégia…",
        "searching": "Pesquisando nas suas fontes…",
        "readingEmails": "Lendo seus e-mails…",
        "composing": "Redigindo sua resposta…",
        "adminTitle": "Contas do Gmail conectadas",
        "adminDesc": "Todas as contas do Gmail que seus usuários conectaram. Metadados somente leitura — você não pode ler o e-mail de ninguém aqui.",
        "adminUser": "Usuário",
        "adminEmail": "Conta do Gmail",
        "adminLastChecked": "Última verificação",
        "adminCount": "{count} conectadas",
        "adminNone": "Nenhuma conta do Gmail conectada ainda.",
        "connectionsTab": "E-mail conectado",
    },
    "it-IT": {
        "thinking": "Sto pensando…",
        "strategizing": "Sto formulando una strategia…",
        "searching": "Ricerca nelle tue fonti…",
        "readingEmails": "Lettura delle tue email…",
        "composing": "Composizione della risposta…",
        "adminTitle": "Account Gmail collegati",
        "adminDesc": "Tutti gli account Gmail collegati dai tuoi utenti. Metadati di sola lettura: non puoi leggere la posta di nessuno da qui.",
        "adminUser": "Utente",
        "adminEmail": "Account Gmail",
        "adminLastChecked": "Ultimo controllo",
        "adminCount": "{count} collegati",
        "adminNone": "Nessun account Gmail ancora collegato.",
        "connectionsTab": "Posta collegata",
    },
    "ru-RU": {
        "thinking": "Думаю…",
        "strategizing": "Формирую стратегию…",
        "searching": "Поиск по вашим источникам…",
        "readingEmails": "Чтение ваших писем…",
        "composing": "Составляю ответ…",
        "adminTitle": "Подключённые аккаунты Gmail",
        "adminDesc": "Все аккаунты Gmail, которые подключили ваши пользователи. Метаданные только для чтения — вы не можете читать чью-либо почту отсюда.",
        "adminUser": "Пользователь",
        "adminEmail": "Аккаунт Gmail",
        "adminLastChecked": "Последняя проверка",
        "adminCount": "подключено: {count}",
        "adminNone": "Пока нет подключённых аккаунтов Gmail.",
        "connectionsTab": "Подключённая почта",
    },
    "ja-JP": {
        "thinking": "考えています…",
        "strategizing": "戦略を立てています…",
        "searching": "ソースを検索しています…",
        "readingEmails": "メールを読んでいます…",
        "composing": "回答を作成しています…",
        "adminTitle": "接続済みの Gmail アカウント",
        "adminDesc": "ユーザーが接続したすべての Gmail アカウント。読み取り専用のメタデータで、ここから誰かのメールを読むことはできません。",
        "adminUser": "ユーザー",
        "adminEmail": "Gmail アカウント",
        "adminLastChecked": "最終確認",
        "adminCount": "{count} 件接続済み",
        "adminNone": "接続済みの Gmail アカウントはまだありません。",
        "connectionsTab": "接続済みメール",
    },
    "zh-CN": {
        "thinking": "思考中…",
        "strategizing": "正在制定策略…",
        "searching": "正在搜索您的来源…",
        "readingEmails": "正在阅读您的邮件…",
        "composing": "正在撰写您的回答…",
        "adminTitle": "已连接的 Gmail 账户",
        "adminDesc": "您的用户已连接的所有 Gmail 账户。仅只读元数据——您无法在此读取任何人的邮件。",
        "adminUser": "用户",
        "adminEmail": "Gmail 账户",
        "adminLastChecked": "上次检查",
        "adminCount": "已连接 {count} 个",
        "adminNone": "尚未连接任何 Gmail 账户。",
        "connectionsTab": "已连接邮箱",
    },
    "zh-TW": {
        "thinking": "思考中…",
        "strategizing": "正在制定策略…",
        "searching": "正在搜尋您的來源…",
        "readingEmails": "正在閱讀您的郵件…",
        "composing": "正在撰寫您的回答…",
        "adminTitle": "已連結的 Gmail 帳戶",
        "adminDesc": "您的使用者已連結的所有 Gmail 帳戶。僅唯讀中繼資料——您無法在此讀取任何人的郵件。",
        "adminUser": "使用者",
        "adminEmail": "Gmail 帳戶",
        "adminLastChecked": "上次檢查",
        "adminCount": "已連結 {count} 個",
        "adminNone": "尚未連結任何 Gmail 帳戶。",
        "connectionsTab": "已連結郵件",
    },
    "bn-IN": {
        "thinking": "ভাবছি…",
        "strategizing": "একটি কৌশল তৈরি করছি…",
        "searching": "আপনার উৎসগুলিতে খুঁজছি…",
        "readingEmails": "আপনার ইমেল পড়ছি…",
        "composing": "আপনার উত্তর তৈরি করছি…",
        "adminTitle": "সংযুক্ত Gmail অ্যাকাউন্ট",
        "adminDesc": "আপনার ব্যবহারকারীরা সংযুক্ত করেছেন এমন সব Gmail অ্যাকাউন্ট। শুধু-পঠন মেটাডেটা — এখান থেকে আপনি কারও ইমেল পড়তে পারবেন না।",
        "adminUser": "ব্যবহারকারী",
        "adminEmail": "Gmail অ্যাকাউন্ট",
        "adminLastChecked": "সর্বশেষ পরীক্ষা",
        "adminCount": "{count} টি সংযুক্ত",
        "adminNone": "এখনও কোনো Gmail অ্যাকাউন্ট সংযুক্ত নেই।",
        "connectionsTab": "সংযুক্ত মেইল",
    },
    "ca-ES": {
        "thinking": "Pensant…",
        "strategizing": "Formulant una estratègia…",
        "searching": "Cercant a les teves fonts…",
        "readingEmails": "Llegint els teus correus…",
        "composing": "Redactant la teva resposta…",
        "adminTitle": "Comptes de Gmail connectats",
        "adminDesc": "Tots els comptes de Gmail que els teus usuaris han connectat. Metadades només de lectura: no pots llegir el correu de ningú des d'aquí.",
        "adminUser": "Usuari",
        "adminEmail": "Compte de Gmail",
        "adminLastChecked": "Última comprovació",
        "adminCount": "{count} connectats",
        "adminNone": "Encara no hi ha cap compte de Gmail connectat.",
        "connectionsTab": "Correu connectat",
    },
    "pl-PL": {
        "thinking": "Myślę…",
        "strategizing": "Opracowuję strategię…",
        "searching": "Przeszukuję Twoje źródła…",
        "readingEmails": "Czytam Twoje wiadomości…",
        "composing": "Tworzę odpowiedź…",
        "adminTitle": "Połączone konta Gmail",
        "adminDesc": "Wszystkie konta Gmail połączone przez Twoich użytkowników. Metadane tylko do odczytu — nie możesz stąd czytać niczyjej poczty.",
        "adminUser": "Użytkownik",
        "adminEmail": "Konto Gmail",
        "adminLastChecked": "Ostatnio sprawdzone",
        "adminCount": "połączono: {count}",
        "adminNone": "Nie połączono jeszcze żadnego konta Gmail.",
        "connectionsTab": "Połączona poczta",
    },
    "tr-TR": {
        "thinking": "Düşünüyorum…",
        "strategizing": "Bir strateji oluşturuluyor…",
        "searching": "Kaynaklarınız aranıyor…",
        "readingEmails": "E-postalarınız okunuyor…",
        "composing": "Yanıtınız hazırlanıyor…",
        "adminTitle": "Bağlı Gmail Hesapları",
        "adminDesc": "Kullanıcılarınızın bağladığı tüm Gmail hesapları. Yalnızca okunabilir meta veriler — buradan kimsenin e-postasını okuyamazsınız.",
        "adminUser": "Kullanıcı",
        "adminEmail": "Gmail Hesabı",
        "adminLastChecked": "Son kontrol",
        "adminCount": "{count} bağlı",
        "adminNone": "Henüz bağlı Gmail hesabı yok.",
        "connectionsTab": "Bağlı Posta",
    },
}


def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def insert_after_key(content: str, key_token: str, new_lines: str) -> str:
    """Insert new_lines right after the first line containing key_token:."""
    lines = content.split("\n")
    for i, line in enumerate(lines):
        if key_token in line:
            lines.insert(i + 1, new_lines)
            return "\n".join(lines)
    raise RuntimeError(f"Anchor '{key_token}' not found")


def build_thinking_block(m: dict) -> str:
    return (
        "    thinking: {\n"
        f'      thinking: "{esc(m["thinking"])}",\n'
        f'      strategizing: "{esc(m["strategizing"])}",\n'
        f'      searching: "{esc(m["searching"])}",\n'
        f'      readingEmails: "{esc(m["readingEmails"])}",\n'
        f'      composing: "{esc(m["composing"])}",\n'
        "    },"
    )


def build_gmail_admin_block(m: dict) -> str:
    return (
        f'    adminTitle: "{esc(m["adminTitle"])}",\n'
        f'    adminDesc: "{esc(m["adminDesc"])}",\n'
        f'    adminUser: "{esc(m["adminUser"])}",\n'
        f'    adminEmail: "{esc(m["adminEmail"])}",\n'
        f'    adminLastChecked: "{esc(m["adminLastChecked"])}",\n'
        f'    adminCount: "{esc(m["adminCount"])}",\n'
        f'    adminNone: "{esc(m["adminNone"])}",'
    )


def main():
    for code, m in T.items():
        path = os.path.join(LOCALES_DIR, code, "index.ts")
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()

        if "adminTitle:" in content and "thinking: {" in content:
            print(f"skip (already present): {code}")
            continue

        content = insert_after_key(content, "processingQuestion:", build_thinking_block(m))
        content = insert_after_key(content, "connectErrorToast:", build_gmail_admin_block(m))
        content = insert_after_key(
            content, "usageTab:", f'    connectionsTab: "{esc(m["connectionsTab"])}",'
        )

        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"updated: {code}")


if __name__ == "__main__":
    main()
