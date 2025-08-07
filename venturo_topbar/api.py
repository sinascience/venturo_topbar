import frappe
from frappe import _

@frappe.whitelist()
def get_navigation_data():
    """Get navigation data for topbar including modules, doctypes, and user info"""

    if frappe.session.user == 'Guest':
        frappe.throw(_("Authentication required"), frappe.AuthenticationError)

    try:
        # Get user's allowed modules
        user_roles = frappe.get_roles(frappe.session.user)

        # Get all modules that user has access to
        modules = frappe.get_all(
            "Module Def",
            fields=["name", "module_name", "app_name"],
            order_by="name"
        )

        # Filter modules based on user permissions
        allowed_modules = []
        for module in modules:
            # Check if user has any doctype access in this module
            module_doctypes = frappe.get_all(
                "DocType",
                fields=["name", "module", "icon", "description", "is_submittable"],
                filters={
                    "module": module.name,
                    "issingle": 0,
                    "istable": 0,
                    "custom": 0
                }
            )

            # Filter doctypes user can read
            accessible_doctypes = []
            for doctype in module_doctypes:
                if frappe.has_permission(doctype.name, "read"):
                    accessible_doctypes.append({
                        "name": doctype.name,
                        "label": _(doctype.name),
                        "icon": doctype.icon or "fa fa-file",
                        "description": doctype.description,
                        "is_submittable": doctype.is_submittable,
                        "route": f"/app/{doctype.name.lower().replace(' ', '-')}"
                    })

            if accessible_doctypes:
                allowed_modules.append({
                    "name": module.name,
                    "module_name": module.module_name or module.name,
                    "label": _(module.label or module.name),
                    "app_name": module.app_name,
                    "icon": module.icon or get_module_icon(module.name),
                    "color": module.color,
                    "doctypes": accessible_doctypes,
                    "route": f"/app/{module.name.lower().replace(' ', '-')}"
                })

        # Get user information
        user_info = frappe.get_cached_doc("User", frappe.session.user)
        user_data = {
            "name": user_info.name,
            "full_name": user_info.full_name or user_info.name,
            "email": user_info.email,
            "user_image": user_info.user_image,
            "role_profile_name": user_info.role_profile_name,
            "language": user_info.language or "en"
        }

        # Get workspace data (ERPNext v13+)
        workspaces = []
        try:
            workspace_list = frappe.get_all(
                "Workspace",
                fields=["name", "title", "icon", "indicator_color", "parent_page", "public", "app"],
				filters={
                    "app": "erpnext",
                },
                order_by="sequence_id"
            )

            for workspace in workspace_list:
                # Check workspace permissions
                if workspace.public or frappe.has_permission("Workspace", "read", workspace.name):
                    workspaces.append({
                        "name": workspace.name,
                        "title": workspace.title,
                        "icon": workspace.icon or "fa fa-desktop",
                        "color": workspace.indicator_color,
                        "parent_page": workspace.parent_page,
                        "route": f"/app/{workspace.name.lower().replace(' ', '-')}"
                    })
        except:
            # Workspaces might not exist in older versions
            pass

        # Get system settings for branding
        system_settings = frappe.get_cached_doc("System Settings")

        return {
            "modules": allowed_modules,
            "workspaces": workspaces,
            "user": user_data,
            "system_settings": {
                "app_name": "Hayyu",
                "app_logo": None,  # Remove logo
                "navbar_color": getattr(system_settings, 'navbar_color', None)
            },
            "permissions": {
                "can_create": frappe.get_user().can_create,
                "can_search": True  # Basic search permission
            }
        }

    except Exception as e:
        frappe.log_error(f"Navigation API Error: {str(e)}")
        frappe.throw(_("Failed to fetch navigation data"))

def get_module_icon(module_name):
    """Get default icon for module"""
    module_icons = {
        "Accounts": "fa fa-money",
        "Selling": "fa fa-tag",
        "Buying": "fa fa-shopping-cart",
        "Stock": "fa fa-cube",
        "Manufacturing": "fa fa-cogs",
        "Projects": "fa fa-tasks",
        "Human Resources": "fa fa-users",
        "Support": "fa fa-life-ring",
        "CRM": "fa fa-handshake-o",
        "Assets": "fa fa-briefcase",
        "Quality Management": "fa fa-check-circle",
        "Website": "fa fa-globe",
        "Setup": "fa fa-cog",
        "Tools": "fa fa-wrench",
        "Integrations": "fa fa-plug",
        "Desk": "fa fa-desktop"
    }
    return module_icons.get(module_name, "fa fa-circle")

@frappe.whitelist()
def get_quick_search_data():
    """Get data for quick search functionality"""

    search_data = []

    # Get recent documents
    recent_docs = frappe.get_all(
        "Version",
        fields=["ref_doctype", "docname"],
        filters={
            "owner": frappe.session.user,
            "ref_doctype": ["not in", ["Version", "Activity Log", "Error Log"]]
        },
        order_by="creation desc",
        limit=10
    )

    for doc in recent_docs:
        if frappe.has_permission(doc.ref_doctype, "read", doc.docname):
            search_data.append({
                "doctype": doc.ref_doctype,
                "name": doc.docname,
                "type": "recent",
                "route": f"/app/{doc.ref_doctype.lower().replace(' ', '-')}/{doc.docname}"
            })

    return search_data
