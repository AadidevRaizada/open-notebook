# -*- coding: utf-8 -*-
"""Inject the organization-management keys into each locale's adminPage block.

Adds organizationsTitle/Desc/Empty, membersCount, joinButton, joinSuccess and
joinError right before the `actions:` sub-object inside `adminPage`. Idempotent:
files that already contain `organizationsTitle:` are skipped.
"""
import re
from pathlib import Path

LOCALES = Path(__file__).resolve().parent.parent / "src" / "lib" / "locales"

KEY_ORDER = [
    "organizationsTitle",
    "organizationsDesc",
    "organizationsEmpty",
    "membersCount",
    "joinButton",
    "joinSuccess",
    "joinError",
]

T = {
    "en-US": {
        "organizationsTitle": "Organizations",
        "organizationsDesc": "Join any organization to view and manage its isolated content. Switch the active organization from the sidebar.",
        "organizationsEmpty": "No organizations yet.",
        "membersCount": "{count} members",
        "joinButton": "Join",
        "joinSuccess": "Joined {org}",
        "joinError": "Failed to join organization",
    },
    "de-DE": {
        "organizationsTitle": "Organisationen",
        "organizationsDesc": "Treten Sie einer Organisation bei, um ihre isolierten Inhalte anzuzeigen und zu verwalten. Wechseln Sie die aktive Organisation über die Seitenleiste.",
        "organizationsEmpty": "Noch keine Organisationen.",
        "membersCount": "{count} Mitglieder",
        "joinButton": "Beitreten",
        "joinSuccess": "{org} beigetreten",
        "joinError": "Beitritt zur Organisation fehlgeschlagen",
    },
    "es-ES": {
        "organizationsTitle": "Organizaciones",
        "organizationsDesc": "Únete a cualquier organización para ver y gestionar su contenido aislado. Cambia la organización activa desde la barra lateral.",
        "organizationsEmpty": "Aún no hay organizaciones.",
        "membersCount": "{count} miembros",
        "joinButton": "Unirse",
        "joinSuccess": "Te has unido a {org}",
        "joinError": "No se pudo unir a la organización",
    },
    "fr-FR": {
        "organizationsTitle": "Organisations",
        "organizationsDesc": "Rejoignez une organisation pour afficher et gérer son contenu isolé. Changez d'organisation active depuis la barre latérale.",
        "organizationsEmpty": "Aucune organisation pour le moment.",
        "membersCount": "{count} membres",
        "joinButton": "Rejoindre",
        "joinSuccess": "Vous avez rejoint {org}",
        "joinError": "Impossible de rejoindre l'organisation",
    },
    "it-IT": {
        "organizationsTitle": "Organizzazioni",
        "organizationsDesc": "Unisciti a qualsiasi organizzazione per visualizzare e gestire i suoi contenuti isolati. Cambia l'organizzazione attiva dalla barra laterale.",
        "organizationsEmpty": "Ancora nessuna organizzazione.",
        "membersCount": "{count} membri",
        "joinButton": "Unisciti",
        "joinSuccess": "Ti sei unito a {org}",
        "joinError": "Impossibile unirsi all'organizzazione",
    },
    "ja-JP": {
        "organizationsTitle": "組織",
        "organizationsDesc": "組織に参加して、その分離されたコンテンツを表示・管理します。アクティブな組織はサイドバーから切り替えられます。",
        "organizationsEmpty": "まだ組織がありません。",
        "membersCount": "メンバー {count} 人",
        "joinButton": "参加",
        "joinSuccess": "{org} に参加しました",
        "joinError": "組織への参加に失敗しました",
    },
    "pl-PL": {
        "organizationsTitle": "Organizacje",
        "organizationsDesc": "Dołącz do dowolnej organizacji, aby wyświetlać i zarządzać jej izolowaną zawartością. Aktywną organizację zmienisz na pasku bocznym.",
        "organizationsEmpty": "Brak organizacji.",
        "membersCount": "Liczba członków: {count}",
        "joinButton": "Dołącz",
        "joinSuccess": "Dołączono do {org}",
        "joinError": "Nie udało się dołączyć do organizacji",
    },
    "pt-BR": {
        "organizationsTitle": "Organizações",
        "organizationsDesc": "Entre em qualquer organização para ver e gerenciar seu conteúdo isolado. Altere a organização ativa na barra lateral.",
        "organizationsEmpty": "Nenhuma organização ainda.",
        "membersCount": "{count} membros",
        "joinButton": "Entrar",
        "joinSuccess": "Você entrou em {org}",
        "joinError": "Falha ao entrar na organização",
    },
    "ru-RU": {
        "organizationsTitle": "Организации",
        "organizationsDesc": "Присоединитесь к любой организации, чтобы просматривать и управлять её изолированным содержимым. Активную организацию можно сменить на боковой панели.",
        "organizationsEmpty": "Пока нет организаций.",
        "membersCount": "Участников: {count}",
        "joinButton": "Присоединиться",
        "joinSuccess": "Вы присоединились к {org}",
        "joinError": "Не удалось присоединиться к организации",
    },
    "tr-TR": {
        "organizationsTitle": "Kuruluşlar",
        "organizationsDesc": "İzole edilmiş içeriğini görüntülemek ve yönetmek için herhangi bir kuruluşa katılın. Etkin kuruluşu kenar çubuğundan değiştirin.",
        "organizationsEmpty": "Henüz kuruluş yok.",
        "membersCount": "{count} üye",
        "joinButton": "Katıl",
        "joinSuccess": "{org} kuruluşuna katıldınız",
        "joinError": "Kuruluşa katılınamadı",
    },
    "zh-CN": {
        "organizationsTitle": "组织",
        "organizationsDesc": "加入任意组织以查看和管理其隔离的内容。可在侧边栏切换活动组织。",
        "organizationsEmpty": "暂无组织。",
        "membersCount": "{count} 名成员",
        "joinButton": "加入",
        "joinSuccess": "已加入 {org}",
        "joinError": "加入组织失败",
    },
    "zh-TW": {
        "organizationsTitle": "組織",
        "organizationsDesc": "加入任何組織以檢視和管理其隔離的內容。可在側邊欄切換使用中的組織。",
        "organizationsEmpty": "尚無組織。",
        "membersCount": "{count} 名成員",
        "joinButton": "加入",
        "joinSuccess": "已加入 {org}",
        "joinError": "加入組織失敗",
    },
    "bn-IN": {
        "organizationsTitle": "সংস্থা",
        "organizationsDesc": "কোনো সংস্থার বিচ্ছিন্ন কন্টেন্ট দেখতে ও পরিচালনা করতে সেটিতে যোগ দিন। সাইডবার থেকে সক্রিয় সংস্থা পরিবর্তন করুন।",
        "organizationsEmpty": "এখনও কোনো সংস্থা নেই।",
        "membersCount": "{count} জন সদস্য",
        "joinButton": "যোগ দিন",
        "joinSuccess": "{org}-এ যোগ দিয়েছেন",
        "joinError": "সংস্থায় যোগ দিতে ব্যর্থ হয়েছে",
    },
    "ca-ES": {
        "organizationsTitle": "Organitzacions",
        "organizationsDesc": "Uneix-te a qualsevol organització per veure i gestionar el seu contingut aïllat. Canvia l'organització activa des de la barra lateral.",
        "organizationsEmpty": "Encara no hi ha organitzacions.",
        "membersCount": "{count} membres",
        "joinButton": "Uneix-te",
        "joinSuccess": "T'has unit a {org}",
        "joinError": "No s'ha pogut unir a l'organització",
    },
}


def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def build_lines(data: dict) -> str:
    lines = []
    for k in KEY_ORDER:
        lines.append(f'    {k}: "{esc(data[k])}",')
    return "\n".join(lines) + "\n"


def main():
    changed = []
    for locale, data in T.items():
        path = LOCALES / locale / "index.ts"
        if not path.exists():
            print(f"MISSING FILE: {path}")
            continue
        text = path.read_text(encoding="utf-8")
        if "organizationsTitle:" in text:
            print(f"SKIP (already present): {locale}")
            continue

        block = build_lines(data)
        # Insert before the `actions: {` sub-object inside adminPage.
        new_text, n = re.subn(
            r"(\n    actions: \{)",
            lambda m: "\n" + block.rstrip("\n") + m.group(1),
            text,
            count=1,
        )
        if n != 1:
            print(f"ERROR: could not find adminPage actions block in {locale}")
            continue

        path.write_text(new_text, encoding="utf-8")
        changed.append(locale)
        print(f"OK: {locale}")

    print(f"\nUpdated {len(changed)} locale(s): {', '.join(changed)}")


if __name__ == "__main__":
    main()
