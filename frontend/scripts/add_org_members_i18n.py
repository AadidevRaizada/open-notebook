# -*- coding: utf-8 -*-
"""Inject the org-member management keys into each locale's adminPage block
(inline Members view added to the admin Organizations section). Inserts before
the `actions:` sub-object. Idempotent: skips files that already have noMembers.
"""
import re
from pathlib import Path

LOCALES = Path(__file__).resolve().parent.parent / "src" / "lib" / "locales"

KEY_ORDER = [
    "noMembers",
    "orgRoleAdmin",
    "orgRoleMember",
    "removeMember",
    "removeMemberConfirmTitle",
    "removeMemberConfirmDesc",
]

T = {
    "en-US": {
        "noMembers": "No members yet.",
        "orgRoleAdmin": "Admin",
        "orgRoleMember": "Member",
        "removeMember": "Remove",
        "removeMemberConfirmTitle": "Remove member?",
        "removeMemberConfirmDesc": "Remove {email} from {org}? They lose access to this organization's content.",
    },
    "de-DE": {
        "noMembers": "Noch keine Mitglieder.",
        "orgRoleAdmin": "Admin",
        "orgRoleMember": "Mitglied",
        "removeMember": "Entfernen",
        "removeMemberConfirmTitle": "Mitglied entfernen?",
        "removeMemberConfirmDesc": "{email} aus {org} entfernen? Der Zugriff auf die Inhalte dieser Organisation geht verloren.",
    },
    "es-ES": {
        "noMembers": "Aún no hay miembros.",
        "orgRoleAdmin": "Administrador",
        "orgRoleMember": "Miembro",
        "removeMember": "Eliminar",
        "removeMemberConfirmTitle": "¿Eliminar miembro?",
        "removeMemberConfirmDesc": "¿Eliminar a {email} de {org}? Perderá el acceso al contenido de esta organización.",
    },
    "fr-FR": {
        "noMembers": "Aucun membre pour le moment.",
        "orgRoleAdmin": "Administrateur",
        "orgRoleMember": "Membre",
        "removeMember": "Retirer",
        "removeMemberConfirmTitle": "Retirer le membre ?",
        "removeMemberConfirmDesc": "Retirer {email} de {org} ? Cette personne perdra l'accès au contenu de cette organisation.",
    },
    "it-IT": {
        "noMembers": "Ancora nessun membro.",
        "orgRoleAdmin": "Amministratore",
        "orgRoleMember": "Membro",
        "removeMember": "Rimuovi",
        "removeMemberConfirmTitle": "Rimuovere il membro?",
        "removeMemberConfirmDesc": "Rimuovere {email} da {org}? Perderà l'accesso ai contenuti di questa organizzazione.",
    },
    "ja-JP": {
        "noMembers": "まだメンバーがいません。",
        "orgRoleAdmin": "管理者",
        "orgRoleMember": "メンバー",
        "removeMember": "削除",
        "removeMemberConfirmTitle": "メンバーを削除しますか？",
        "removeMemberConfirmDesc": "{email} を {org} から削除しますか？この組織のコンテンツにアクセスできなくなります。",
    },
    "pl-PL": {
        "noMembers": "Brak członków.",
        "orgRoleAdmin": "Administrator",
        "orgRoleMember": "Członek",
        "removeMember": "Usuń",
        "removeMemberConfirmTitle": "Usunąć członka?",
        "removeMemberConfirmDesc": "Usunąć {email} z {org}? Utraci dostęp do treści tej organizacji.",
    },
    "pt-BR": {
        "noMembers": "Ainda não há membros.",
        "orgRoleAdmin": "Administrador",
        "orgRoleMember": "Membro",
        "removeMember": "Remover",
        "removeMemberConfirmTitle": "Remover membro?",
        "removeMemberConfirmDesc": "Remover {email} de {org}? Ele perderá o acesso ao conteúdo desta organização.",
    },
    "ru-RU": {
        "noMembers": "Пока нет участников.",
        "orgRoleAdmin": "Администратор",
        "orgRoleMember": "Участник",
        "removeMember": "Удалить",
        "removeMemberConfirmTitle": "Удалить участника?",
        "removeMemberConfirmDesc": "Удалить {email} из {org}? Он потеряет доступ к содержимому этой организации.",
    },
    "tr-TR": {
        "noMembers": "Henüz üye yok.",
        "orgRoleAdmin": "Yönetici",
        "orgRoleMember": "Üye",
        "removeMember": "Kaldır",
        "removeMemberConfirmTitle": "Üye kaldırılsın mı?",
        "removeMemberConfirmDesc": "{email} kullanıcısını {org} kuruluşundan kaldır? Bu kuruluşun içeriğine erişimini kaybeder.",
    },
    "zh-CN": {
        "noMembers": "暂无成员。",
        "orgRoleAdmin": "管理员",
        "orgRoleMember": "成员",
        "removeMember": "移除",
        "removeMemberConfirmTitle": "移除成员？",
        "removeMemberConfirmDesc": "将 {email} 从 {org} 中移除？该成员将失去对此组织内容的访问权限。",
    },
    "zh-TW": {
        "noMembers": "尚無成員。",
        "orgRoleAdmin": "管理員",
        "orgRoleMember": "成員",
        "removeMember": "移除",
        "removeMemberConfirmTitle": "移除成員？",
        "removeMemberConfirmDesc": "將 {email} 從 {org} 中移除？該成員將失去對此組織內容的存取權限。",
    },
    "bn-IN": {
        "noMembers": "এখনও কোনো সদস্য নেই।",
        "orgRoleAdmin": "অ্যাডমিন",
        "orgRoleMember": "সদস্য",
        "removeMember": "সরান",
        "removeMemberConfirmTitle": "সদস্য সরাবেন?",
        "removeMemberConfirmDesc": "{org} থেকে {email}-কে সরাবেন? তিনি এই সংস্থার কন্টেন্টে অ্যাক্সেস হারাবেন।",
    },
    "ca-ES": {
        "noMembers": "Encara no hi ha membres.",
        "orgRoleAdmin": "Administrador",
        "orgRoleMember": "Membre",
        "removeMember": "Elimina",
        "removeMemberConfirmTitle": "Voleu eliminar el membre?",
        "removeMemberConfirmDesc": "Voleu eliminar {email} de {org}? Perdrà l'accés al contingut d'aquesta organització.",
    },
}


def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def build_lines(data: dict) -> str:
    return "\n".join(f'    {k}: "{esc(data[k])}",' for k in KEY_ORDER) + "\n"


def main():
    changed = []
    for locale, data in T.items():
        path = LOCALES / locale / "index.ts"
        if not path.exists():
            print(f"MISSING FILE: {path}")
            continue
        text = path.read_text(encoding="utf-8")
        if "noMembers:" in text:
            print(f"SKIP (already present): {locale}")
            continue
        block = build_lines(data)
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
