--[[
  cv.lua: builds CV sections from the YAML files in cv/.

  Usage in a .qmd:   {{< cv education >}}
                     {{< cv experience group="additional" >}}
                     {{< cv publications type="article" >}}
  Sections: headline, contact, summary (cv/profile.yml), experience,
            education, pubnote, publications, talks, software, skills.

  HTML: dates sit on the right, the organization on the line below the title,
  links become wireframe badges. PDF (cvpdf format): the same content is
  wrapped in the \cv... macros defined in _extensions/cvpdf/cvpdf.tex.
]]

local MY_SURNAME = "Jané"
local SITE = "https://matthewbjane.com/"

local function is_html() return quarto.doc.is_format("html") end
local function is_latex() return quarto.doc.is_format("latex") or quarto.doc.is_format("pdf") end

local function project_dir()
  local d = quarto.project.directory
  if d == nil or d == "" then d = "." end
  return d
end

-- Bold the CV owner's surname in `authors:` lines and protect "*" (equal
-- contribution markers) from Markdown, before the YAML is parsed.
local function preprocess(text)
  local out = {}
  for line in (text .. "\n"):gmatch("(.-)\n") do
    if line:match("^%s*%-?%s*authors%s*:") then
      local double = line:match(':%s*"') ~= nil
      local bs = double and "\\\\" or "\\"
      local key, value = line:match("^(.-authors%s*:)(.*)$")
      value = value:gsub("%*", bs .. "*")
      local esc_star = (bs .. "*"):gsub("%p", "%%%0")
      value = value:gsub(MY_SURNAME .. esc_star, "@@MEQ@@")
      value = value:gsub(MY_SURNAME, "**" .. MY_SURNAME .. "**")
      value = value:gsub("@@MEQ@@", "**" .. MY_SURNAME .. bs .. "***")
      line = key .. value
    end
    table.insert(out, line)
  end
  return table.concat(out, "\n")
end

local function parse_file(path, quiet)
  local f = io.open(path, "r")
  if not f then
    if not quiet then quarto.log.warning("cv: cannot read " .. path) end
    return nil
  end
  local text = f:read("a")
  f:close()
  return pandoc.read("---\n" .. preprocess(text) .. "\n---\n", "markdown").meta
end

--[[
  Private overlay (for a local, never-published CV). A document can set
    cv-private: private.yml
  in its front matter. That file may contain:
    profile:     fields that replace profile.yml fields (headline, summary),
                 plus contact_prepend: a list of extra contact items
    experience:  professional_prepend / additional_prepend: extra entries
                 by_id: { <id>: {fields merged into the entry with that id} }
    personal, training, ...: extra sections, shown with {{< cv lines src="private:personal" >}}
  The public CV (CV.qmd) does not set cv-private, so none of this reaches the site.
]]
local META = nil
local PRIV = nil
local function private()
  if PRIV ~= nil then return PRIV or nil end
  PRIV = false
  local p = META and META["cv-private"] and pandoc.utils.stringify(META["cv-private"]) or ""
  if p ~= "" then PRIV = parse_file(p) or false end
  return PRIV or nil
end

local function prepend(list, extra)
  if extra == nil or #extra == 0 then return list end
  local out = {}
  for _, x in ipairs(extra) do table.insert(out, x) end
  for _, x in ipairs(list or {}) do table.insert(out, x) end
  return out
end

local function overlay(name, m)
  local P = private()
  if not P or not P[name] then return m end
  local o = P[name]
  if name == "profile" then
    for k, v in pairs(o) do if k ~= "contact_prepend" then m[k] = v end end
    m.contact = prepend(m.contact, o.contact_prepend)
  elseif name == "experience" then
    for _, g in ipairs({ "professional", "additional" }) do
      m[g] = prepend(m[g], o[g .. "_prepend"])
      if o.by_id then
        for _, e in ipairs(m[g] or {}) do
          local add = e.id and o.by_id[pandoc.utils.stringify(e.id)]
          if add then for k, v in pairs(add) do e[k] = v end end
        end
      end
    end
  end
  return m
end

local cache = {}
local function read_yaml(name)
  if cache[name] then return cache[name] end
  local m
  local pname = name:match("^private:(.+)$")
  if pname then
    local P = private()
    m = P and P[pname] and { entries = P[pname] } or nil
  else
    m = parse_file(project_dir() .. "/cv/" .. name .. ".yml")
    if m then m = overlay(name, m) end
  end
  cache[name] = m
  return m
end

local function ptype(v) return pandoc.utils.type(v) end

local function inl(v)
  if v == nil then return pandoc.Inlines({}) end
  local t = ptype(v)
  if t == "Inlines" then return v end
  if t == "Blocks" then return pandoc.utils.blocks_to_inlines(v) end
  if t == "string" or t == "number" or t == "boolean" then
    return pandoc.utils.blocks_to_inlines(pandoc.read(tostring(v), "markdown").blocks)
  end
  return pandoc.Inlines({ pandoc.Str(pandoc.utils.stringify(v)) })
end

local function str(v) if v == nil then return nil end return pandoc.utils.stringify(v) end
local function has(v) return v ~= nil and str(v) ~= "" end

local function cat(...)
  local r = pandoc.Inlines({})
  for _, x in ipairs({ ... }) do
    if type(x) == "string" then r:insert(pandoc.Str(x))
    elseif ptype(x) == "Inline" then r:insert(x)
    else r:extend(x) end
  end
  return r
end

local function ends_punct(v) local s = str(v) or "" return s:match("[%.%?!]$") ~= nil end
local function tex(s) return pandoc.RawInline("latex", s) end
local function texb(s) return pandoc.RawBlock("latex", s) end
local function span(x, cls) return pandoc.Span(inl(x), pandoc.Attr("", { cls })) end
local function div(blocks, cls) return pandoc.Div(blocks, pandoc.Attr("", type(cls) == "table" and cls or { cls })) end

-- site-relative links (e.g. manuscripts/x.pdf) point at the live site in the PDF
local function abs_url(u)
  if u and not is_html() and not u:match("^%a[%w+.-]*:") then return SITE .. u:gsub("^/", "") end
  return u
end

local function bullets(list)
  if list == nil or #list == 0 then return nil end
  local items = {}
  for _, x in ipairs(list) do table.insert(items, { pandoc.Plain(inl(x)) }) end
  return pandoc.BulletList(items)
end

-- extra links under an entry: badges in HTML, a small "Data · Code" line in the PDF
local function link_row(links)
  if links == nil or #links == 0 then return nil end
  local out = pandoc.Inlines({})
  for i, l in ipairs(links) do
    local label, url = str(l.label), abs_url(str(l.url))
    if is_html() then
      if i > 1 then out:insert(pandoc.Space()) end
      out:insert(pandoc.Link(label, url, "", pandoc.Attr("", { "btn", "btn-primary", "btn-sm" })))
    else
      if i > 1 then out:extend({ pandoc.Space(), pandoc.Str("·"), pandoc.Space() }) end
      out:insert(pandoc.Link(label, url))
    end
  end
  if is_html() then return div({ pandoc.Plain(out) }, "cv-links") end
  return pandoc.Plain(cat(tex("\\cvlinks{"), out, tex("}")))
end

-- one dated entry: title (bold) and date on the first line, the organization
-- on the second, then optional blocks (bullets, description, links)
local function entry(title, dates, sub, extra)
  if is_html() then
    local blocks = pandoc.Blocks({})
    local head = cat(pandoc.Span(title, pandoc.Attr("", { "cv-what" })))
    if has(dates) then head:insert(span(dates, "cv-date")) end
    blocks:insert(div({ pandoc.Plain(head) }, "cv-head"))
    if sub and #sub > 0 then blocks:insert(div({ pandoc.Plain(sub) }, "cv-org")) end
    for _, b in ipairs(extra or {}) do if b then blocks:insert(b) end end
    return pandoc.Blocks({ div(blocks, "cv-entry") })
  end
  local blocks = pandoc.Blocks({})
  -- dates go in as raw TeX so "–" stays an en dash in the mono font
  local d = (str(dates) or ""):gsub("([&%%$#_{}])", "\\%1"):gsub("–", "\\textendash{}"):gsub("—", "\\textemdash{}")
  blocks:insert(pandoc.Plain(cat(tex("\\cventry{"), title, tex("}{" .. d .. "}{"), sub or {}, tex("}"))))
  for _, b in ipairs(extra or {}) do if b then blocks:insert(b) end end
  blocks:insert(texb("\\cvendentry"))
  return blocks
end

-- a bulleted list of references. items: { {inlines, extra block or nil}, ... }
local function ref_list(items)
  if #items == 0 then return pandoc.Blocks({}) end
  if is_html() then
    local li = {}
    for _, it in ipairs(items) do
      local b = { pandoc.Para(it[1]) }
      if it[2] then table.insert(b, it[2]) end
      table.insert(li, b)
    end
    return pandoc.Blocks({ div({ pandoc.BulletList(li) }, "cv-refs") })
  end
  local out = pandoc.Blocks({ texb("\\begin{cvrefs}") })
  for _, it in ipairs(items) do
    out:insert(pandoc.Plain(cat(tex("\\item "), it[1])))
    if it[2] then out:insert(it[2]) end
  end
  out:insert(texb("\\end{cvrefs}"))
  return out
end


---------------------------------------------------------------- sections

local S = {}

function S.headline()
  local m = read_yaml("profile"); if not m then return {} end
  if is_latex() then return pandoc.Blocks({ pandoc.Plain(cat(tex("\\cvheadline{"), inl(m.headline), tex("}"))) }) end
  return pandoc.Blocks({ pandoc.Para({ span(m.headline, "cv-headline") }) })
end

function S.summary()
  local m = read_yaml("profile"); if not m then return {} end
  local v = m.summary
  if ptype(v) == "Blocks" then return v end
  return pandoc.Blocks({ pandoc.Para(inl(v)) })
end

function S.contact()
  local m = read_yaml("profile"); if not m or not m.contact then return {} end
  local out = pandoc.Inlines({})
  for i, c in ipairs(m.contact) do
    if is_html() then
      if i > 1 then out:insert(pandoc.Space()) end
      local label = pandoc.Inlines({})
      if has(c.icon) then
        label:insert(pandoc.RawInline("html", '<i class="bi bi-' .. str(c.icon) .. '" aria-hidden="true"></i>'))
        label:insert(pandoc.Space())
      end
      label:extend(inl(c.label))
      if has(c.url) then out:insert(pandoc.Link(label, str(c.url), "", pandoc.Attr("", { "btn", "btn-secondary" })))
      else out:insert(pandoc.Span(label, pandoc.Attr("", { "btn", "btn-secondary", "disabled" }))) end
    else
      if i > 1 then out:insert(tex("\\cvsep ")) end
      -- items without a url (e.g. a mailing address) are plain text
      if has(c.url) then out:insert(pandoc.Link(inl(c.label), str(c.url))) else out:extend(inl(c.label)) end
    end
  end
  if is_html() then return pandoc.Blocks({ div({ pandoc.Plain(out) }, "cv-contact") }) end
  return pandoc.Blocks({ pandoc.Plain(cat(tex("\\cvcontact{"), out, tex("}"))) })
end

function S.education()
  local m = read_yaml("education"); if not m then return {} end
  local out = pandoc.Blocks({})
  for _, e in ipairs(m.entries or {}) do
    local title = cat(pandoc.Strong(inl(e.degree)))
    if has(e.field) then title:extend(cat(", ", pandoc.Strong(inl(e.field)))) end
    -- second line: School · Advisor: X · GPA: Y
    local sub = inl(e.school)
    if has(e.advisor) then sub = cat(sub, " · Advisor: ", inl(e.advisor)) end
    if has(e.gpa) then sub = cat(sub, " · GPA: ", inl(e.gpa)) end
    local extra = {}
    if has(e.thesis) then table.insert(extra, pandoc.Para({ pandoc.Emph(inl(e.thesis)) })) end
    table.insert(extra, bullets(e.details))
    out:extend(entry(title, e.dates, sub, extra))
  end
  return out
end

function S.experience(kwargs)
  local m = read_yaml("experience"); if not m then return {} end
  local group = kwargs and has(kwargs["group"]) and str(kwargs["group"]) or "professional"
  local out = pandoc.Blocks({})
  for _, e in ipairs(m[group] or {}) do
    local sub = inl(e.organization)
    if has(e.location) then sub = cat(sub, ", ", inl(e.location)) end
    -- federal-resume details (hours, pay, supervisor): set only by the private overlay
    local fed = pandoc.Inlines({})
    local function add(label, v)
      if not has(v) then return end
      if #fed > 0 then fed:extend({ pandoc.Space(), pandoc.Str("·"), pandoc.Space() }) end
      fed:extend(cat(label, inl(v)))
    end
    add("Hours per week: ", e.hours)
    add("Salary: ", e.salary)
    add("Series/grade: ", e.grade)
    add("Supervisor: ", e.supervisor)
    local extra = {}
    if #fed > 0 then
      if is_latex() then table.insert(extra, pandoc.Plain(cat(tex("\\cvfed{"), fed, tex("}"))))
      else table.insert(extra, div({ pandoc.Plain(fed) }, "cv-org")) end
    end
    table.insert(extra, bullets(e.details))
    out:extend(entry(cat(pandoc.Strong(inl(e.title))), e.dates, sub, extra))
  end
  return out
end

function S.talks()
  local m = read_yaml("talks"); if not m then return {} end
  local out = pandoc.Blocks({})
  for _, e in ipairs(m.entries or {}) do
    local extra = {}
    if has(e.details) then table.insert(extra, pandoc.Para(inl(e.details))) end
    -- **Location** – *Title*, with the description on the second line
    local head = cat(pandoc.Strong(inl(e.location or e.event)))
    if has(e.title) then head:extend(cat(" – ", pandoc.Emph(inl(e.title)))) end
    out:extend(entry(head, e.date, inl(e.description), extra))
  end
  return out
end

function S.software()
  local m = read_yaml("software"); if not m then return {} end
  -- one bullet per tool: **Name** KIND  description  url
  -- sub-items (e.g. the simulators) follow in plain text: web page as a nested
  -- list with descriptions, PDF as one run of "Name url; Name url".
  local items = {}
  for _, e in ipairs(m.entries or {}) do
    local c = cat(pandoc.Strong(inl(e.name)))
    if has(e.kind) then
      if is_html() then c:extend(cat(" ", pandoc.Span(inl(e.kind), pandoc.Attr("", { "badge", "rounded-pill" }))))
      else c:extend(cat(tex("\\cvkind{"), inl(e.kind), tex("}"))) end
    end
    c:extend(cat(is_html() and " " or tex("\\hspace{0.45em}"), inl(e.description)))
    if has(e.url) then
      local u = abs_url(str(e.url))
      c:extend(cat(" ", pandoc.Link((u:gsub("^https?://", "")), u)))
    end
    local extra = nil
    if e.items and #e.items > 0 then
      if is_html() then
        local its = {}
        for _, it in ipairs(e.items) do
          local line = inl(it.name)
          if has(it.description) then line = cat(line, ": ", inl(it.description)) end
          if has(it.url) then local u = abs_url(str(it.url)); line:extend(cat(" ", pandoc.Link((u:gsub("^https?://", "")), u))) end
          table.insert(its, { pandoc.Plain(line) })
        end
        extra = pandoc.BulletList(its)
      else
        for k, it in ipairs(e.items) do
          c:extend(cat(k == 1 and " " or "; ", tex("\\mbox{"), inl(it.name), tex("}")))
          if has(it.url) then local u = abs_url(str(it.url)); c:extend(cat(" ", pandoc.Link((u:gsub("^https?://", "")), u))) end
        end
      end
    end
    table.insert(items, { c, extra })
  end
  return ref_list(items)
end

-- "Category: items" lines. {{< cv skills >}}, {{< cv lines src="service" >}},
-- or a private-overlay list: {{< cv lines src="private:personal" >}}
function S.lines(kwargs)
  local src = kwargs and has(kwargs["src"]) and str(kwargs["src"]) or "skills"
  local m = read_yaml(src); if not m then return {} end
  local out = pandoc.Blocks({})
  for _, e in ipairs(m.entries or {}) do
    if is_html() then
      out:insert(div({ pandoc.Para(cat(pandoc.Strong(cat(inl(e.category), ":")), " ", inl(e.items))) }, "cv-skill"))
    else
      out:insert(pandoc.Plain(cat(tex("\\cvskill{"), inl(e.category), tex("}{"), inl(e.items), tex("}"))))
    end
  end
  return out
end

-- CERTIFICATIONS: dated entries (title, organization, dates).
-- {{< cv certifications src="private:certifications" >}} or src="certifications" (cv/certifications.yml)
function S.certifications(kwargs)
  local src = kwargs and has(kwargs["src"]) and str(kwargs["src"]) or "certifications"
  local m = read_yaml(src); if not m then return {} end
  local out = pandoc.Blocks({})
  for _, e in ipairs(m.entries or {}) do
    out:extend(entry(cat(pandoc.Strong(inl(e.title))), e.dates, inl(e.organization), { bullets(e.details) }))
  end
  return out
end

function S.skills() return S.lines({ src = "skills" }) end

-- talks as one brief "Category: items" line, e.g. for a two-page resume:
-- {{< cv talkline >}}  ->  Talks and workshops: Princeton University (2025); ...
function S.talkline(kwargs)
  local m = read_yaml("talks"); if not m then return {} end
  local label = kwargs and has(kwargs["label"]) and str(kwargs["label"]) or "Talks and workshops"
  local items = pandoc.Inlines({})
  for k, e in ipairs(m.entries or {}) do
    if k > 1 then items:extend(cat("; ")) end
    -- each "Place (year)" is kept on one line in the PDF
    local one = inl(e.location or e.event)
    if has(e.date) then one = cat(one, " (", inl(e.date), ")") end
    if is_latex() then items:extend(cat(tex("\\mbox{"), one, tex("}"))) else items:extend(one) end
  end
  items:insert(pandoc.Str("."))
  if is_html() then
    return pandoc.Blocks({ div({ pandoc.Para(cat(pandoc.Strong(cat(label, ":")), " ", items)) }, "cv-skill") })
  end
  return pandoc.Blocks({ pandoc.Plain(cat(tex("\\cvskill{"), label, tex("}{"), items, tex("}"))) })
end

-- MEDIA COVERAGE, in the publication style: Author (Year) Title. *Outlet*. Note. URL.
function S.media()
  local m = read_yaml("media"); if not m then return {} end
  local items = {}
  for _, e in ipairs(m.entries or {}) do
    -- with an author: Author (Year) Title.   without one: Title (Year).
    local c
    if has(e.author) then
      c = cat(inl(e.author), " (", inl(e.year), ") ", inl(e.title))
      if not ends_punct(e.title) then c:insert(pandoc.Str(".")) end
    else
      c = cat(inl(e.title), " (", inl(e.year), ").")
    end
    c:extend(cat(" ", pandoc.Emph(inl(e.outlet)), "."))
    if has(e.note) then
      c:extend(cat(" ", inl(e.note)))
      if not ends_punct(e.note) then c:insert(pandoc.Str(".")) end
    end
    if has(e.url) then
      -- linked by site name (e.g. chronicle.com) to keep the line short
      local u = str(e.url)
      local host = (u:match("^%a+://([^/]+)") or u):gsub("^www%.", "")
      c:extend(cat(" ", pandoc.Link(host, u), "."))
    end
    table.insert(items, { c })
  end
  return ref_list(items)
end

-- "* Equal contribution." once, only if some publication uses the marker
function S.pubnote()
  local m = read_yaml("publications"); if not m then return {} end
  for _, e in ipairs(m.entries or {}) do
    if (str(e.authors) or ""):find("%*") then
      if is_latex() then return pandoc.Blocks({ pandoc.Plain({ tex("\\cvnote{* Equal contribution.}") }) }) end
      return pandoc.Blocks({ pandoc.Para({ span("\\* Equal contribution.", "cv-note") }) })
    end
  end
  return {}
end

-- ACE reference style: Surname, Surname (Year) Title. *Venue*. DOI: 10.xxxx.
function S.publications(kwargs)
  local m = read_yaml("publications"); if not m then return {} end
  -- type="article" or several: type="book,public"
  local want = nil
  if kwargs and has(kwargs["type"]) then
    want = {}
    for t in str(kwargs["type"]):gmatch("[^,%s]+") do want[t] = true end
  end
  local items = {}
  for _, e in ipairs(m.entries or {}) do
    if want == nil or want[str(e.type)] then
      local c = cat(inl(e.authors), " (", inl(e.year), ") ", inl(e.title))
      if not ends_punct(e.title) then c:insert(pandoc.Str(".")) end
      if has(e.venue) then
        c:extend(cat(" ", pandoc.Emph(inl(e.venue))))
        if not ends_punct(e.venue) then c:insert(pandoc.Str(".")) end
      end
      if has(e.note) then
        c:extend(cat(" ", inl(e.note)))
        if not ends_punct(e.note) then c:insert(pandoc.Str(".")) end
      end
      if has(e.status) then
        c:extend(cat(" ", inl(e.status)))
        if not ends_punct(e.status) then c:insert(pandoc.Str(".")) end
      end
      if has(e.doi) then
        -- DOIs are case-insensitive; shown (and linked) in uppercase
        local doi = str(e.doi):upper()
        c:extend(cat(" DOI: ", pandoc.Link(doi, "https://doi.org/" .. doi), "."))
      elseif has(e.url) then
        c:extend(cat(" URL: ", pandoc.Link(str(e.url), abs_url(str(e.url))), "."))
      end
      table.insert(items, { c, link_row(e.links) })
    end
  end
  return ref_list(items)
end

return {
  ["cv"] = function(args, kwargs, meta)
    META = meta
    local section = args[1] and pandoc.utils.stringify(args[1]) or ""
    local fn = S[section]
    if not fn then
      quarto.log.warning("cv: unknown section '" .. section .. "'")
      return pandoc.Null()
    end
    return fn(kwargs)
  end
}
