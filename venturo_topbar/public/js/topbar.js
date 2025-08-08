// Global variable for navigation data
let navigationData = null;

// Initialize search functionality
frappe.provide("venturo_topbar.search");

// Search utilities - comprehensive search functionality
venturo_topbar.search.utils = {
	setup_recent: function () {
		this.recent = JSON.parse(frappe.boot.user.recent || "[]") || [];
	},

	get_recent_pages: function (keywords) {
		if (keywords === null) keywords = "";
		var me = this,
			values = [],
			options = [];

		function find(list, keywords, process) {
			list.forEach(function (item, i) {
				var _item = $.isArray(item) ? item[0] : item;
				_item = __(_item || "")
					.toLowerCase()
					.replace(/-/g, " ");

				if (keywords === _item || _item.indexOf(keywords) !== -1) {
					var option = process(item);

					if (option) {
						if ($.isPlainObject(option)) {
							option = [option];
						}
						option.forEach(function (o) {
							o.match = item;
							o.recent = true;
						});

						options = option.concat(options);
					}
				}
			});
		}

		me.recent.forEach(function (doctype, i) {
			values.push([doctype[1], ["Form", doctype[0], doctype[1]]]);
		});

		values = values.reverse();

		frappe.route_history.forEach(function (route, i) {
			if (route[0] === "Form") {
				values.push([route[2], route]);
			} else if (
				["List", "Tree", "Workspaces", "query-report"].includes(route[0]) ||
				route[2] === "Report"
			) {
				if (route[1]) {
					values.push([route[1], route]);
				}
			} else if (route[0]) {
				values.push([frappe.route_titles[route.join("/")] || route[0], route]);
			}
		});

		find(values, keywords, function (match) {
			const route = match[1];
			const out = { route: route };

			if (route[0] === "Form") {
				const doctype = route[1];
				if (route.length > 2 && doctype !== route[2]) {
					const docname = route[2];
					out.label = __(doctype) + " " + docname.bold();
					out.value = __(doctype) + " " + docname;
				} else {
					out.label = __(doctype).bold();
					out.value = __(doctype);
				}
			} else if (
				["List", "Tree", "Workspaces", "query-report"].includes(route[0]) &&
				route.length > 1
			) {
				const view_type = route[0];
				const view_name = route[1];
				switch (view_type) {
					case "List":
						out.label = __("{0} List", [__(view_name).bold()]);
						out.value = __("{0} List", [__(view_name)]);
						break;
					case "Tree":
						out.label = __("{0} Tree", [__(view_name).bold()]);
						out.value = __("{0} Tree", [__(view_name)]);
						break;
					case "Workspaces":
						out.label = __("{0} Workspace", [__(view_name).bold()]);
						out.value = __("{0} Workspace", [__(view_name)]);
						break;
					case "query-report":
						out.label = __("{0} Report", [__(view_name).bold()]);
						out.value = __("{0} Report", [__(view_name)]);
						break;
				}
			} else if (match[0]) {
				out.label = frappe.utils.escape_html(match[0]).bold();
				out.value = match[0];
			} else {
				console.log("Illegal match", match);
			}
			out.index = 80;
			return out;
		});

		return options;
	},

	get_frequent_links() {
		let options = [];
		frappe.boot.frequently_visited_links.forEach((link) => {
			const label = frappe.utils.get_route_label(link.route);
			options.push({
				route: link.route,
				label: label,
				value: label,
				index: link.count,
			});
		});
		if (!options.length) {
			return this.get_recent_pages("");
		}
		return options;
	},

	get_search_in_list: function (keywords) {
		var me = this;
		var out = [];
		if (keywords.split(" ").includes("in") && keywords.slice(-2) !== "in") {
			var parts = keywords.split(" in ");
			frappe.boot.user.can_read.forEach(function (item) {
				if (frappe.boot.user.can_search.includes(item)) {
					const search_result = me.fuzzy_search(parts[1], item, true);
					if (search_result.score) {
						out.push({
							type: "In List",
							label: __("Find {0} in {1}", [
								__(parts[0]),
								search_result.marked_string,
							]),
							value: __("Find {0} in {1}", [__(parts[0]), __(item)]),
							route_options: { name: ["like", "%" + parts[0] + "%"] },
							index: 1 + search_result.score,
							route: ["List", item],
						});
					}
				}
			});
		}
		return out;
	},

	get_creatables: function (keywords) {
		var me = this;
		var out = [];
		var firstKeyword = keywords.split(" ")[0];
		if (firstKeyword.toLowerCase() === __("new")) {
			frappe.boot.user.can_create.forEach(function (item) {
				const search_result = me.fuzzy_search(keywords.substr(4), item, true);
				var level = search_result.score;
				if (level) {
					out.push({
						type: "New",
						label: __("New {0}", [search_result.marked_string || __(item)]),
						value: __("New {0}", [__(item)]),
						index: 1 + level,
						match: item,
						onclick: function () {
							frappe.new_doc(item, true);
						},
					});
				}
			});
		}
		return out;
	},

	get_doctypes: function (keywords) {
		var me = this;
		var out = [];

		var score, marked_string, target;
		var option = function (type, route, order) {
			// check to skip extra list in the text
			// eg. Price List List should be only Price List
			let skip_list = type === "List" && target.endsWith("List");
			if (skip_list) {
				var label = marked_string || __(target);
			} else {
				label = __(`{0} ${skip_list ? "" : type}`, [marked_string || __(target)]);
			}
			return {
				type: type,
				label: label,
				value: __(`{0} ${type}`, [target]),
				index: score + order,
				match: target,
				route: route,
			};
		};
		frappe.boot.user.can_read.forEach(function (item) {
			const search_result = me.fuzzy_search(keywords, item, true);
			({ score, marked_string } = search_result);
			if (score) {
				target = item;
				if (frappe.boot.single_types.includes(item)) {
					out.push(option("", ["Form", item, item], 0.05));
				} else if (frappe.boot.user.can_search.includes(item)) {
					// include 'making new' option
					if (frappe.boot.user.can_create.includes(item)) {
						var match = item;
						out.push({
							type: "New",
							label: __("New {0}", [search_result.marked_string || __(item)]),
							value: __("New {0}", [__(item)]),
							index: score + 0.015,
							match: item,
							onclick: function () {
								frappe.new_doc(match, true);
							},
						});
					}

					out.push(option("List", ["List", item], 0.05));
					if (frappe.model.can_get_report(item)) {
						out.push(option("Report", ["List", item, "Report"], 0.04));
					}
				}
			}
		});
		return out;
	},

	get_reports: function (keywords) {
		var me = this;
		var out = [];
		var route;
		Object.keys(frappe.boot.user.all_reports).forEach(function (item) {
			const search_result = me.fuzzy_search(keywords, item, true);
			var level = search_result.score;
			if (level > 0) {
				var report = frappe.boot.user.all_reports[item];
				if (report.report_type == "Report Builder")
					route = ["List", report.ref_doctype, "Report", item];
				else route = ["query-report", item];
				out.push({
					type: "Report",
					label: __("Report {0}", [search_result.marked_string || __(item)]),
					value: __("Report {0}", [__(item)]),
					index: level,
					route: route,
				});
			}
		});
		return out;
	},

	get_pages: function (keywords) {
		var me = this;
		var out = [];
		this.pages = {};
		$.each(frappe.boot.page_info, function (name, p) {
			me.pages[p.title] = p;
			p.name = name;
		});
		Object.keys(this.pages).forEach(function (item) {
			if (item == "Hub" || item == "hub") return;
			const search_result = me.fuzzy_search(keywords, item, true);
			var level = search_result.score;
			if (level) {
				var page = me.pages[item];
				out.push({
					type: "Page",
					label: __("Open {0}", [search_result.marked_string || __(item)]),
					value: __("Open {0}", [__(item)]),
					match: item,
					index: level,
					route: [page.route || page.name],
				});
			}
		});
		var target = "Calendar";
		if (__("calendar").indexOf(keywords.toLowerCase()) === 0) {
			out.push({
				type: "Calendar",
				value: __("Open {0}", [__(target)]),
				index: me.fuzzy_search(keywords, "Calendar"),
				match: target,
				route: ["List", "Event", target],
			});
		}
		target = "Hub";
		if (__("hub").indexOf(keywords.toLowerCase()) === 0) {
			out.push({
				type: "Hub",
				value: __("Open {0}", [__(target)]),
				index: me.fuzzy_search(keywords, "Hub"),
				match: target,
				route: [target, "Item"],
			});
		}
		if (__("email inbox").indexOf(keywords.toLowerCase()) === 0) {
			out.push({
				type: "Inbox",
				value: __("Open {0}", [__("Email Inbox")]),
				index: me.fuzzy_search(keywords, "email inbox"),
				match: target,
				route: ["List", "Communication", "Inbox"],
			});
		}
		return out;
	},

	get_workspaces: function (keywords) {
		var me = this;
		var out = [];
		frappe.boot.allowed_workspaces.forEach(function (item) {
			const search_result = me.fuzzy_search(keywords, item.name, true);
			var level = search_result.score;
			if (level > 0) {
				var ret = {
					type: "Workspace",
					label: __("Open {0}", [search_result.marked_string || __(item.name)]),
					value: __("Open {0}", [__(item.name)]),
					index: level,
					route: [frappe.router.slug(item.name)],
				};

				out.push(ret);
			}
		});
		return out;
	},

	get_dashboards: function (keywords) {
		var me = this;
		var out = [];
		frappe.boot.dashboards.forEach(function (item) {
			const search_result = me.fuzzy_search(keywords, item.name, true);
			var level = search_result.score;
			if (level > 0) {
				var ret = {
					type: "Dashboard",
					label: __("{0} Dashboard", [search_result.marked_string || __(item.name)]),
					value: __("{0} Dashboard", [__(item.name)]),
					index: level,
					route: ["dashboard-view", item.name],
				};

				out.push(ret);
			}
		});
		return out;
	},

	get_nav_results: function (keywords) {
		function sort_uniques(array) {
			var routes = [],
				out = [];
			array.forEach(function (d) {
				if (d.route) {
					if (d.route[0] === "List" && d.route[2]) {
						d.route.splice(2);
					}
					var str_route = d.route.join("/");
					if (routes.indexOf(str_route) === -1) {
						routes.push(str_route);
						out.push(d);
					} else {
						var old = routes.indexOf(str_route);
						if (out[old].index > d.index) {
							out[old] = d;
						}
					}
				} else {
					out.push(d);
				}
			});
			return out.sort(function (a, b) {
				return b.index - a.index;
			});
		}
		var lists = [],
			setup = [];
		var all_doctypes = sort_uniques(this.get_doctypes(keywords));
		all_doctypes.forEach(function (d) {
			if (d.type === "") {
				setup.push(d);
			} else {
				lists.push(d);
			}
		});
		var in_keyword = keywords.split(" in ")[0];
		return [
			{
				title: __("Recents"),
				fetch_type: "Nav",
				results: sort_uniques(this.get_recent_pages(keywords)),
			},
			{
				title: __("Create a new ..."),
				fetch_type: "Nav",
				results: sort_uniques(this.get_creatables(keywords)),
			},
			{
				title: __("Lists"),
				fetch_type: "Nav",
				results: lists,
			},
			{
				title: __("Reports"),
				fetch_type: "Nav",
				results: sort_uniques(this.get_reports(keywords)),
			},
			{
				title: __("Administration"),
				fetch_type: "Nav",
				results: sort_uniques(this.get_pages(keywords)),
			},
			{
				title: __("Workspace"),
				fetch_type: "Nav",
				results: sort_uniques(this.get_workspaces(keywords)),
			},
			{
				title: __("Dashboard"),
				fetch_type: "Nav",
				results: sort_uniques(this.get_dashboards(keywords)),
			},
			{
				title: __("Setup"),
				fetch_type: "Nav",
				results: setup,
			},
			{
				title: __("Find '{0}' in ...", [in_keyword]),
				fetch_type: "Nav",
				results: sort_uniques(this.get_search_in_list(keywords)),
			},
		];
	},

	fuzzy_search: function (keywords = "", _item = "", return_marked_string = false) {
		const item = __(_item);

		const [, score, matches] = fuzzy_match(keywords, item, return_marked_string);

		if (!return_marked_string) {
			return score;
		}
		if (score == 0) {
			return {
				score: score,
				marked_string: item,
			};
		}

		// Create Boolean mask to mark matching indices in the item string
		const matchArray = Array(item.length).fill(0);
		matches.forEach((index) => (matchArray[index] = 1));

		let marked_string = "";
		let buffer = "";

		// Clear the buffer and return marked matches.
		const flushBuffer = () => {
			if (!buffer) return "";
			const temp = `<mark>${buffer}</mark>`;
			buffer = "";
			return temp;
		};

		matchArray.forEach((isMatch, index) => {
			if (isMatch) {
				buffer += item[index];
			} else {
				marked_string += flushBuffer();
				marked_string += item[index];
			}
		});
		marked_string += flushBuffer();

		return { score, marked_string };
	},

	searchable_functions: []
};

(function () {
	"use strict";

	function initTopbar() {
		// Check if required objects exist
		if (typeof frappe === "undefined" || !frappe.call) {
			return false;
		}

		// Only run on desk pages
		if (!window.location.pathname.startsWith("/app")) {
			return false;
		}

		loadNavigationData();
		return true;
	}

	function loadNavigationData() {
		// Show loading indicator
		showLoadingTopbar();

		console.log("Attempting to load navigation data...");

		frappe.call({
			method: "venturo_topbar.api.get_navigation_data",
			callback: function (response) {
				console.log("Navigation API response:", response);

				if (response.message) {
					navigationData = response.message;
					console.log("Navigation data loaded successfully:", response.message);
					console.log("Navigation data variable set to:", navigationData);

					hideLoadingTopbar();
					createTopbarNavigation();
				} else {
					console.error("Failed to load navigation data - no message in response");
					console.error("Full response:", response);
					hideLoadingTopbar();
				}
			},
			error: function (error) {
				console.error("Navigation API Error:", error);
				console.error("Error details:", {
					message: error.message,
					status: error.status,
					statusText: error.statusText,
				});
				hideLoadingTopbar();
			},
		});
	}

	function showLoadingTopbar() {
		$(".custom-topbar").remove();
		$("body").prepend(`
            <div class="custom-topbar loading-topbar">
                <div class="topbar-logo">
                    <div class="loading-spinner"></div>
                    <span>Loading...</span>
                </div>
            </div>
        `);
	}

	function hideLoadingTopbar() {
		$(".loading-topbar").remove();
	}

	// Document ready handler
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", function () {
			setTimeout(function () {
				if (!initTopbar()) {
					watchForFrappe();
				}
			}, 1000);
		});
	} else {
		setTimeout(function () {
			if (!initTopbar()) {
				watchForFrappe();
			}
		}, 1000);
	}

	function watchForFrappe() {
		let attempts = 0;
		const maxAttempts = 50;

		const checkFrappe = setInterval(function () {
			attempts++;

			if (initTopbar() || attempts >= maxAttempts) {
				clearInterval(checkFrappe);
				if (attempts >= maxAttempts) {
					console.error("Failed to initialize topbar after maximum attempts");
				}
			}
		}, 100);
	}

	// Watch for route changes
	let currentPath = window.location.pathname;
	setInterval(function () {
		if (window.location.pathname !== currentPath) {
			currentPath = window.location.pathname;
			setTimeout(function () {
				if (window.location.pathname.startsWith("/app") && navigationData) {
					createTopbarNavigation();
				} else if (window.location.pathname.startsWith("/app") && !navigationData) {
					// If we're on an app page but navigationData is not loaded, try to load it
					console.log(
						"Route changed to app page but navigationData not loaded, attempting to load..."
					);
					loadNavigationData();
				}
			}, 500);
		}
	}, 100);

	// Fallback: Try to load navigation data after a longer delay if not loaded
	setTimeout(function () {
		if (!navigationData && window.location.pathname.startsWith("/app")) {
			console.log("Fallback: Attempting to load navigation data after delay...");
			loadNavigationData();
		}
	}, 5000);
})();

function createTopbarNavigation() {
	if (!navigationData) {
		console.warn("Navigation data not available - cannot create topbar");
		return;
	}

	console.log("Creating topbar navigation with data:", navigationData);

	// Remove existing topbar
	$(".custom-topbar").remove();

	// Create topbar HTML
	const topbarHTML = `
        <div class="custom-topbar">
            <div class="topbar-logo">
                ${generateLogo()}
            </div>

            <nav class="topbar-nav">
                ${generateNavItems()}
            </nav>

            <div class="topbar-search">
                ${generateSearchBox()}
            </div>

            <button class="mobile-menu-toggle d-md-none">
                <i class="fa fa-bars"></i>
            </button>

            <div class="topbar-right">
                ${generateUserSection()}
            </div>
        </div>

        <div class="mobile-nav-menu">
            ${generateMobileNavItems()}
        </div>
    `;

	// Insert topbar
	$("body").prepend(topbarHTML);

	// Initialize event handlers
	initializeTopbarEvents();
}

function generateLogo() {
	if (!navigationData || !navigationData.system_settings) {
		return `<span class="app-name">Hayyu</span>`;
	}

	const systemSettings = navigationData.system_settings;
	const appName = systemSettings.app_name || "Hayyu";

	return `<span class="app-name">${appName}</span>`;
}

function generateNavItems() {
	if (!navigationData) {
		console.warn("Navigation data not available for nav items");
		return "";
	}

	const workspaces = navigationData.workspaces || [];

	let navHTML = "";

	// Only use workspaces - ignore modules completely
	if (workspaces.length === 0) {
		console.warn("No workspaces available");
		return "";
	}

	// Workspaces are already filtered in Python API, so use them directly
	navHTML = generateWorkspaceTree(workspaces);

	return navHTML;
}

function generateWorkspaceTree(workspaces) {
	console.log("Generating workspace tree for:", workspaces);

	// Separate parent and child workspaces
	const parentWorkspaces = workspaces.filter((ws) => !ws.parent_page || ws.parent_page === "");
	const childWorkspaces = workspaces.filter((ws) => ws.parent_page && ws.parent_page !== "");

	console.log("Parent workspaces:", parentWorkspaces);
	console.log("Child workspaces:", childWorkspaces);

	// Group children by parent
	const childrenByParent = {};
	childWorkspaces.forEach((child) => {
		if (!childrenByParent[child.parent_page]) {
			childrenByParent[child.parent_page] = [];
		}
		childrenByParent[child.parent_page].push(child);
	});

	console.log("Children grouped by parent:", childrenByParent);

	let navHTML = "";
	let itemCount = 0;
	const maxItems = 8;

	// Generate navigation for parent workspaces
	parentWorkspaces.forEach((parent) => {
		if (itemCount >= maxItems) return;

		const icon = parent.icon || `fa fa-${getDefaultIcon(parent.name)}`;
		const label = parent.title || parent.name;
		const children = childrenByParent[parent.name] || [];

		console.log(`Generating nav item for ${parent.name} with ${children.length} children`);

		navHTML += `
            <div class="topbar-nav-item" data-workspace="${parent.name}">
                <a href="${parent.route}" class="topbar-nav-link">
                    <i class="${icon}"></i>
                    ${label}
                </a>
                ${generateWorkspaceDropdown(parent, children)}
            </div>
        `;

		itemCount++;
	});

	// Add "More" dropdown if there are more parent workspaces
	if (parentWorkspaces.length > maxItems) {
		const remainingParents = parentWorkspaces.slice(maxItems);
		navHTML += `
            <div class="topbar-nav-item">
                <a href="#" class="topbar-nav-link">
                    <i class="fa fa-ellipsis-h"></i>
                    More
                </a>
                <div class="topbar-dropdown">
                    ${generateMoreWorkspaceItems(remainingParents, childrenByParent)}
                </div>
            </div>
        `;
	}

	return navHTML;
}

function generateWorkspaceDropdown(parent, children) {
	if (children.length === 0) {
		return "";
	}

	let dropdownHTML = '<div class="topbar-dropdown">';

	// Add parent workspace link at the top
	dropdownHTML += `
        <a href="${parent.route}" class="topbar-dropdown-item parent-workspace">
            <i class="${parent.icon || `fa fa-${getDefaultIcon(parent.name)}`}"></i>
            ${parent.title || parent.name}
        </a>
        <div class="dropdown-divider"></div>
    `;

	// Add child workspaces
	children.forEach((child) => {
		const icon = child.icon || `fa fa-${getDefaultIcon(child.name)}`;
		dropdownHTML += `
            <a href="${child.route}" class="topbar-dropdown-item">
                <i class="${icon}"></i>
                ${child.title || child.name}
            </a>
        `;
	});

	dropdownHTML += "</div>";
	return dropdownHTML;
}

function generateMoreWorkspaceItems(parents, childrenByParent) {
	let moreHTML = "";

	parents.forEach((parent) => {
		const icon = parent.icon || `fa fa-${getDefaultIcon(parent.name)}`;
		const label = parent.title || parent.name;
		const children = childrenByParent[parent.name] || [];

		moreHTML += `
            <a href="${parent.route}" class="topbar-dropdown-item">
                <i class="${icon}"></i>
                ${label}
            </a>
        `;

		// Add children as sub-items
		children.forEach((child) => {
			const childIcon = child.icon || `fa fa-${getDefaultIcon(child.name)}`;
			moreHTML += `
                <a href="${child.route}" class="topbar-dropdown-item sub-item">
                    <i class="${childIcon}"></i>
                    ${child.title || child.name}
                </a>
            `;
		});
	});

	return moreHTML;
}

function generateDropdown(item) {
	if (!item.doctypes || item.doctypes.length === 0) {
		return "";
	}

	let dropdownHTML = '<div class="topbar-dropdown">';

	// Limit to 10 items per dropdown
	const limitedDoctypes = item.doctypes.slice(0, 10);

	limitedDoctypes.forEach((doctype) => {
		dropdownHTML += `
            <a href="${doctype.route}" class="topbar-dropdown-item">
                <i class="${doctype.icon}"></i>
                ${doctype.label}
            </a>
        `;
	});

	if (item.doctypes.length > 10) {
		dropdownHTML += `
            <a href="${item.route}" class="topbar-dropdown-item view-all">
                <i class="fa fa-arrow-right"></i>
                View All (${item.doctypes.length})
            </a>
        `;
	}

	dropdownHTML += "</div>";
	return dropdownHTML;
}

function generateMoreItems(items) {
	let moreHTML = "";

	items.forEach((item) => {
		const icon = item.icon || `fa fa-${getDefaultIcon(item.name)}`;
		const label = item.title || item.label || item.module_name || item.name;

		moreHTML += `
            <a href="${item.route}" class="topbar-dropdown-item">
                <i class="${icon}"></i>
                ${label}
            </a>
        `;
	});

	return moreHTML;
}

function generateSearchBox() {
	return `
        <div class="topbar-search-container">
            <input type="text" class="topbar-search-input" placeholder="Search or type command (Ctrl + K)" />
            <i class="fa fa-search topbar-search-icon"></i>
            <div class="topbar-search-results"></div>
        </div>
    `;
}

function generateUserSection() {
	if (!navigationData || !navigationData.user) {
		console.warn("User data not available for user section");
		return "";
	}

	const user = navigationData.user;
	const userImage = user.user_image || "/assets/frappe/images/ui/avatar.png";

	return `
        <div class="topbar-nav-item">
            <a href="#" class="topbar-user">
                <img src="${userImage}" alt="User">
                ${user.full_name}
            </a>
            <div class="topbar-dropdown user-dropdown">
                <a href="/app/user-profile" class="topbar-dropdown-item">
                    <i class="fa fa-user"></i> My Profile
                </a>
                <a href="/app/user-settings" class="topbar-dropdown-item">
                    <i class="fa fa-cog"></i> Settings
                </a>
                <div class="dropdown-divider"></div>
                <a href="/api/method/logout" class="topbar-dropdown-item">
                    <i class="fa fa-sign-out"></i> Logout
                </a>
            </div>
        </div>
    `;
}

function generateMobileNavItems() {
	if (!navigationData) {
		console.warn("Navigation data not available for mobile nav items");
		return "";
	}

	const workspaces = navigationData.workspaces || [];
	let mobileHTML = "";

	if (workspaces.length === 0) {
		console.warn("No workspaces available for mobile navigation");
		return "";
	}

	// Only use workspace tree for mobile
	const parentWorkspaces = workspaces.filter((ws) => !ws.parent_page || ws.parent_page === "");
	const childWorkspaces = workspaces.filter((ws) => ws.parent_page && ws.parent_page !== "");

	// Group children by parent
	const childrenByParent = {};
	childWorkspaces.forEach((child) => {
		if (!childrenByParent[child.parent_page]) {
			childrenByParent[child.parent_page] = [];
		}
		childrenByParent[child.parent_page].push(child);
	});

	// Generate mobile navigation
	parentWorkspaces.forEach((parent) => {
		const icon = parent.icon || `fa fa-${getDefaultIcon(parent.name)}`;
		const label = parent.title || parent.name;
		const children = childrenByParent[parent.name] || [];

		mobileHTML += `
            <div class="mobile-nav-item">
                <a href="${parent.route}" class="mobile-nav-link">
                    <i class="${icon}"></i>
                    ${label}
                </a>
            </div>
        `;

		// Add children as sub-items
		children.forEach((child) => {
			const childIcon = child.icon || `fa fa-${getDefaultIcon(child.name)}`;
			mobileHTML += `
                <div class="mobile-nav-item sub-item">
                    <a href="${child.route}" class="mobile-nav-link">
                        <i class="${childIcon}"></i>
                        ${child.title || child.name}
                    </a>
                </div>
            `;
		});
	});

	return mobileHTML;
}

function getDefaultIcon(moduleName) {
	const icons = {
		Accounts: "money",
		Selling: "tag",
		Buying: "shopping-cart",
		Stock: "cube",
		Manufacturing: "cogs",
		Projects: "tasks",
		"Human Resources": "users",
		Support: "life-ring",
		CRM: "handshake-o",
		Assets: "briefcase",
	};

	return icons[moduleName] || "circle";
}

function initializeTopbarEvents() {
	// Mobile menu toggle
	$(".mobile-menu-toggle").on("click", function () {
		$(".mobile-nav-menu").toggleClass("active");
	});

	// Simple search functionality
	$(".topbar-search-input").on("input", debounce(handleSearch, 300));

	// Hide search results when clicking outside
	$(document).on("click", function(e) {
		if (!$(e.target).closest('.topbar-search-container').length) {
			$(".topbar-search-results").hide();
		}
	});

	// Keyboard shortcut for search (Ctrl+K or Cmd+K)
	$(document).on("keydown", function (e) {
		if ((e.ctrlKey || e.metaKey) && e.key === "k") {
			e.preventDefault();
			$(".topbar-search-input").focus();
		}
	});

	// Dropdown functionality
	$(".topbar-nav-item").on("mouseenter", function () {
		const $dropdown = $(this).find(".topbar-dropdown");
		if ($dropdown.length > 0) {
			$(".topbar-dropdown").hide();
			$dropdown.show();
		}
	});

	$(".topbar-nav-item").on("mouseleave", function () {
		$(this).find(".topbar-dropdown").hide();
	});

	// Close dropdowns when clicking outside
	$(document).on("click", function (e) {
		if (!$(e.target).closest(".custom-topbar, .mobile-nav-menu").length) {
			$(".mobile-nav-menu").removeClass("active");
			$(".topbar-dropdown").hide();
		}
	});

	// Close dropdowns when clicking on dropdown items
	$(".topbar-dropdown-item").on("click", function () {
		$(".topbar-dropdown").hide();
	});
}

function handleSearch(e) {
	const query = e.target.value.trim();
	const resultsContainer = $(".topbar-search-results");

	if (query.length < 2) {
		resultsContainer.hide().empty();
		return;
	}

	// Show loading
	resultsContainer.html('<div class="search-loading">Searching...</div>').show();

	// Use comprehensive search implementation
	performComprehensiveSearch(query, resultsContainer);
}

function performComprehensiveSearch(query, container) {
	// Initialize search utilities if not already done
	if (typeof frappe !== 'undefined' && frappe.boot && frappe.boot.user) {
		venturo_topbar.search.utils.setup_recent();
	}

	// Get comprehensive search results using the full search functionality
	const navResults = venturo_topbar.search.utils.get_nav_results(query);
	let allResults = [];

	// Flatten and collect all results from different categories
	navResults.forEach(category => {
		if (category.results && category.results.length > 0) {
			category.results.forEach(result => {
				// Convert to our simple format for display
				const item = {
					title: result.label || result.value || result.match,
					subtitle: category.title,
					route: result.route,
					type: result.type || category.title.toLowerCase(),
					index: result.index || 0,
					onclick: result.onclick
				};
				allResults.push(item);
			});
		}
	});

	// Sort by index (higher is better)
	allResults.sort((a, b) => (b.index || 0) - (a.index || 0));

	// Display top 15 results
	displayComprehensiveSearchResults(allResults.slice(0, 15), container);
}

function displayComprehensiveSearchResults(results, container) {
	if (results.length === 0) {
		container.html('<div class="search-no-results">No results found</div>').show();
		return;
	}

	let resultsHTML = '<div class="simple-search-results">';

	results.forEach((result) => {
		let href = '#';
		let clickHandler = '';

		if (result.onclick) {
			// Handle onclick functions
			clickHandler = ' onclick="' + result.onclick.toString() + '"';
		} else if (result.route) {
			// Handle route arrays and strings
			if (Array.isArray(result.route)) {
				href = frappe.router.make_url(result.route);
			} else {
				href = result.route;
			}
		}

		const icon = getSearchResultIcon(result.type);
		const title = result.title || result.match || 'Unknown';
		const subtitle = result.subtitle || result.type || '';

		resultsHTML += `
			<a href="${href}" class="simple-search-item" data-type="${result.type}"${clickHandler}>
				<i class="fa ${icon}"></i>
				<div class="search-item-content">
					<div class="search-item-title">${title}</div>
					<div class="search-item-subtitle">${subtitle}</div>
				</div>
			</a>
		`;
	});

	resultsHTML += '</div>';
	container.html(resultsHTML).show();
}

function displaySimpleSearchResults(results, container) {
	if (results.length === 0) {
		container.html('<div class="search-no-results">No results found</div>').show();
		return;
	}

	let resultsHTML = '<div class="simple-search-results">';

	results.forEach((result) => {
		const href = Array.isArray(result.route) ?
			frappe.router.make_url(result.route) :
			result.route;

		const icon = getSearchResultIcon(result.type);

		resultsHTML += `
			<a href="${href}" class="simple-search-item" data-type="${result.type}">
				<i class="fa ${icon}"></i>
				<div class="search-item-content">
					<div class="search-item-title">${result.title}</div>
					<div class="search-item-subtitle">${result.subtitle}</div>
				</div>
			</a>
		`;
	});

	resultsHTML += '</div>';
	container.html(resultsHTML).show();
}

function getSearchResultIcon(type) {
	const icons = {
		'recent': 'fa-clock-o',
		'workspace': 'fa-th-large',
		'Workspace': 'fa-th-large',
		'list': 'fa-list',
		'List': 'fa-list',
		'doctype': 'fa-file-text-o',
		'form': 'fa-edit',
		'New': 'fa-plus',
		'Report': 'fa-bar-chart',
		'Page': 'fa-file-o',
		'Dashboard': 'fa-dashboard',
		'In List': 'fa-search',
		'Recents': 'fa-clock-o',
		'reports': 'fa-bar-chart',
		'administration': 'fa-cog',
		'dashboard': 'fa-dashboard',
		'setup': 'fa-wrench',
		'create a new ...': 'fa-plus'
	};
	return icons[type] || 'fa-search';
}

function debounce(func, wait) {
	let timeout;
	return function executedFunction(...args) {
		const later = () => {
			clearTimeout(timeout);
			func(...args);
		};
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
	};
}


const SEQUENTIAL_BONUS = 25; // bonus for adjacent matches
const SEPARATOR_BONUS = 30; // bonus if match occurs after a separator
const CAMEL_BONUS = 30; // bonus if match is uppercase and prev is lower
const FIRST_LETTER_BONUS = 15; // bonus if the first letter is matched

const LEADING_LETTER_PENALTY = -5; // penalty applied for every letter in str before the first match
const MAX_LEADING_LETTER_PENALTY = -15; // maximum penalty for leading letters
const UNMATCHED_LETTER_PENALTY = -1;

/**
 * Does a fuzzy search to find pattern inside a string.
 * @param {*} pattern string				Pattern to search for
 * @param {*} str string    				String being searched
 * @returns [boolean, number, Array<number>]		A boolean whether the pattern was found or not, a search score,
 * 							and an array with the positional match indices.
 */
function fuzzy_match(pattern, str) {
	const recursion_count = 0;
	const recursion_limit = 10;
	const max_matches = 256;

	return fuzzy_match_recursive(
		pattern,
		str,
		0 /* pattern_cur_index */,
		0 /* str_curr_index */,
		null /* src_matches */,
		[] /* matches */,
		max_matches,
		0 /* next_match */,
		recursion_count,
		recursion_limit
	);
}

function fuzzy_match_recursive(
	pattern,
	str,
	pattern_cur_index,
	str_curr_index,
	src_matches,
	matches,
	max_matches,
	next_match,
	recursion_count,
	recursion_limit
) {
	let out_score = 0;

	// Return if recursion limit is reached.
	if (++recursion_count >= recursion_limit) {
		return [false, out_score, matches];
	}

	// Return if we reached ends of strings.
	if (pattern_cur_index === pattern.length || str_curr_index === str.length) {
		return [false, out_score, matches];
	}

	// Recursion params
	let recursive_match = false;
	let best_recursive_matches = [];
	let best_recursive_score = 0;

	// Loop through pattern and str looking for a match.
	let first_match = true;
	while (pattern_cur_index < pattern.length && str_curr_index < str.length) {
		// Normalize and compare individual characters
		const normalized_pattern_char = pattern[pattern_cur_index]
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.toLowerCase();
		const normalized_str_char = str[str_curr_index]
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.toLowerCase();
		// Match found.
		if (normalized_pattern_char === normalized_str_char) {
			if (next_match >= max_matches) {
				return [false, out_score, matches];
			}

			if (first_match && src_matches) {
				matches = [...src_matches];
				first_match = false;
			}

			const [matched, recursive_score, recursive_matches] = fuzzy_match_recursive(
				pattern,
				str,
				pattern_cur_index,
				str_curr_index + 1,
				matches,
				[] /* recursive_matches */,
				max_matches,
				next_match,
				recursion_count,
				recursion_limit
			);

			if (matched) {
				// Pick best recursive score.
				if (!recursive_match || recursive_score > best_recursive_score) {
					best_recursive_matches = [...recursive_matches];
					best_recursive_score = recursive_score;
				}
				recursive_match = true;
			}

			matches[next_match++] = str_curr_index;
			++pattern_cur_index;
		}
		++str_curr_index;
	}

	const matched = pattern_cur_index === pattern.length;

	if (matched) {
		out_score = 100;

		// Apply leading letter penalty
		let penalty = LEADING_LETTER_PENALTY * matches[0];
		penalty = penalty < MAX_LEADING_LETTER_PENALTY ? MAX_LEADING_LETTER_PENALTY : penalty;
		out_score += penalty;

		//Apply unmatched penalty
		const unmatched = str.length - next_match;
		out_score += UNMATCHED_LETTER_PENALTY * unmatched;

		// Apply ordering bonuses
		for (let i = 0; i < next_match; i++) {
			const curr_idx = matches[i];

			if (i > 0) {
				const prev_idx = matches[i - 1];
				if (curr_idx == prev_idx + 1) {
					out_score += SEQUENTIAL_BONUS;
				}
			}

			// Check for bonuses based on neighbor character value.
			if (curr_idx > 0) {
				// Camel case
				const neighbor = str[curr_idx - 1];
				const curr = str[curr_idx];
				if (neighbor !== neighbor.toUpperCase() && curr !== curr.toLowerCase()) {
					out_score += CAMEL_BONUS;
				}
				const is_neighbour_separator = neighbor == "_" || neighbor == " ";
				if (is_neighbour_separator) {
					out_score += SEPARATOR_BONUS;
				}
			} else {
				// First letter
				out_score += FIRST_LETTER_BONUS;
			}
		}

		// Return best result
		if (recursive_match && (!matched || best_recursive_score > out_score)) {
			// Recursive score is better than "this"
			matches = [...best_recursive_matches];
			out_score = best_recursive_score;
			return [true, out_score, matches];
		} else if (matched) {
			// "this" score is better than recursive
			return [true, out_score, matches];
		} else {
			return [false, out_score, matches];
		}
	}
	return [false, out_score, matches];
}
