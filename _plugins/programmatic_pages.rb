# Programmatic SEO pages for VJs TV.
#
# Generates collection-derived hub pages so that the rich front-matter
# (artist x country x technology x event-type) becomes crawlable surface
# area instead of being trapped inside individual detail pages.
#
# Generated routes:
#   /artists/by-country/<slug>/
#   /artists/by-technology/<slug>/
#   /events/by-country/<slug>/
#   /events/by-type/<slug>/
#   /technology/<slug>/projects/
#
# All pages share the `programmatic-list` layout, which renders an
# intro paragraph, an ItemList + CollectionPage JSON-LD block, a
# BreadcrumbList, and the matching detail-page cards.
#
# A first-pass `normalize` step writes derived attributes onto the
# collection documents themselves (country_slug, technology_slugs,
# event_type_slug, matched_tech_slugs) so the layout can filter via
# plain Liquid `where` / `where_exp` without re-doing the work per page.

require "set"

module ProgrammaticSEO
  module_function

  def slugify(value)
    return nil if value.nil?
    s = value.to_s.strip
    return nil if s.empty?
    s = s.downcase
    s = s.gsub(/&/, " and ")
    s = s.gsub(/[^a-z0-9]+/, "-")
    s = s.gsub(/^-+|-+$/, "")
    return nil if s.empty?
    s
  end

  # Resolve a country name from a doc, preferring the explicit `country`
  # field and falling back to the last comma-separated segment of
  # `location`. Returns nil for placeholders like "N/A".
  def country_of(doc)
    c = doc.data["country"]
    if c.nil? || c.to_s.strip.empty?
      loc = doc.data["location"].to_s
      return nil if loc.empty?
      return nil if loc =~ /\AN\/A/i
      c = loc.split(",").last.to_s.strip
    end
    c = c.to_s.strip
    return nil if c.empty?
    return nil if c =~ /\AN\/A/i
    c
  end

  # Build the set of acceptable lowercase match keys for a technology
  # title so projects that list a shortened name still match.
  # Example: "Adobe After Effects" -> ["adobe after effects",
  #   "after effects"]
  VENDOR_PREFIXES = %w[
    adobe apple akai blackmagic disguise novation arkaos
    pandoras hippotizer
  ].freeze

  def tech_match_keys(title)
    return [] if title.nil? || title.to_s.strip.empty?
    keys = Set.new
    base = title.to_s.downcase.strip
    keys << base
    # Strip an em-dash / en-dash / hyphen tail, e.g.
    # "VDMX - Real-Time VJ Software" -> "vdmx".
    short = base.split(/\s+[-\u2013\u2014]\s+/).first.to_s.strip
    keys << short unless short.empty?
    # Drop a known vendor prefix, e.g. "adobe after effects" ->
    # "after effects".
    parts = base.split(/\s+/, 2)
    if parts.length == 2 && VENDOR_PREFIXES.include?(parts[0])
      keys << parts[1]
    end
    keys.to_a.reject(&:empty?)
  end

  class Generator < Jekyll::Generator
    safe true
    priority :low

    SECTION_TITLES = {
      "vjs"        => "Artists",
      "projects"   => "Projects",
      "events"     => "Events",
      "studios"    => "Studios",
      "technology" => "Technology",
    }.freeze

    SECTION_URLS = {
      "vjs"        => "/artists/",
      "projects"   => "/projects/",
      "events"     => "/events/",
      "studios"    => "/studios/",
      "technology" => "/technology/",
    }.freeze

    def generate(site)
      normalize_collections(site)
      build_artists_by_country(site)
      build_artists_by_technology(site)
      build_events_by_country(site)
      build_events_by_type(site)
      build_technology_projects(site)
    end

    private

    def normalize_collections(site)
      # Artists.
      docs(site, "vjs").each do |doc|
        c = ProgrammaticSEO.country_of(doc)
        if c
          doc.data["country"] = c
          doc.data["country_slug"] = ProgrammaticSEO.slugify(c)
        end
        techs = (doc.data["technologies"] || []).map { |t| t.to_s }.reject(&:empty?)
        doc.data["technology_slugs"] = techs.map { |t| ProgrammaticSEO.slugify(t) }.compact
      end

      # Events.
      docs(site, "events").each do |doc|
        c = ProgrammaticSEO.country_of(doc)
        if c
          doc.data["country"] = c
          doc.data["country_slug"] = ProgrammaticSEO.slugify(c)
        end
        et = doc.data["event_type"]
        doc.data["event_type_slug"] = ProgrammaticSEO.slugify(et) if et
      end

      # Build a canonical "tech doc -> match keys" map and reverse-tag
      # projects with the slug of every technology doc that they match.
      tech_match_lookup = {} # slug => [keys]
      docs(site, "technology").each do |t|
        slug = ProgrammaticSEO.slugify(t.data["title"])
        next if slug.nil?
        t.data["title_slug"] = slug
        tech_match_lookup[slug] = ProgrammaticSEO.tech_match_keys(t.data["title"])
      end

      docs(site, "projects").each do |p|
        techs_lc = (p.data["technologies"] || []).map { |x| x.to_s.downcase.strip }
        # Join into a single haystack so multi-word tool names like
        # "after effects" still word-boundary match inside qualified
        # strings like "After Effects / PFTrack" or
        # "After Effects (Post-Production Glow/Effects)".
        haystack = " " + techs_lc.join(" \u0001 ") + " "
        matched = []
        tech_match_lookup.each do |slug, keys|
          next if keys.empty?
          hit = keys.any? do |k|
            # Word-boundary contains: key surrounded by non-word chars in
            # the haystack. Avoids "OBS" matching "observer".
            re = /(?:^|[^a-z0-9])#{Regexp.escape(k)}(?:[^a-z0-9]|$)/
            haystack.match?(re)
          end
          matched << slug if hit
        end
        p.data["matched_tech_slugs"] = matched
      end
    end

    def build_artists_by_country(site)
      buckets = {}
      docs(site, "vjs").each do |a|
        slug = a.data["country_slug"]
        name = a.data["country"]
        next if slug.nil? || name.nil?
        (buckets[slug] ||= { name: name, count: 0 })[:count] += 1
      end
      buckets.each do |slug, info|
        site.pages << make_page(
          site,
          dir: "/artists/by-country/#{slug}/",
          data: {
            "layout"           => "programmatic-list",
            "kind"             => "artists_by_country",
            "value"            => info[:name],
            "slug"             => slug,
            "count"            => info[:count],
            "title"            => "VJ Artists in #{info[:name]}",
            "meta_title"       => "VJ Artists in #{info[:name]} | Visual Performers Directory",
            "meta_description" => truncate_meta("Directory of #{info[:count]} VJ #{plural(info[:count], 'artist')} and visual performers based in #{info[:name]}. Watch their work, see the tools they use, and connect with the local audiovisual scene on VJs TV."),
            "intro"            => "Visual artists and live VJs based in #{info[:name]}. #{info[:count]} #{plural(info[:count], 'artist')} listed on VJs TV \u2014 browse profiles, watch their projects, and explore the tools that define the local visual scene.",
            "breadcrumb_parent_title"  => "Artists",
            "breadcrumb_parent_url"    => "/artists/",
            "breadcrumb_section_title" => "By Country",
            "sitemap"          => true,
          }
        )
      end
    end

    def build_artists_by_technology(site)
      buckets = {}
      docs(site, "vjs").each do |a|
        seen = Set.new
        (a.data["technologies"] || []).each do |t|
          slug = ProgrammaticSEO.slugify(t)
          next if slug.nil? || seen.include?(slug)
          seen << slug
          (buckets[slug] ||= { name: t.to_s, count: 0 })[:count] += 1
        end
      end
      buckets.each do |slug, info|
        # Always emit so internal links from artist detail pages don't 404.
        # Quality risk on single-artist pages is acceptable; the URL is
        # still a valid hub for the tool itself.
        site.pages << make_page(
          site,
          dir: "/artists/by-technology/#{slug}/",
          data: {
            "layout"           => "programmatic-list",
            "kind"             => "artists_by_technology",
            "value"            => info[:name],
            "slug"             => slug,
            "count"            => info[:count],
            "title"            => "VJ Artists Using #{info[:name]}",
            "meta_title"       => "VJ Artists Using #{info[:name]} | Visual Performers & Tools",
            "meta_description" => truncate_meta("#{info[:count]} VJ artists who include #{info[:name]} in their toolchain. See live performances, audiovisual projects, and the visual style of artists working with #{info[:name]}."),
            "intro"            => "Visual artists and live VJs who include #{info[:name]} in their toolchain. #{info[:count]} #{plural(info[:count], 'artist')} on VJs TV use this tool \u2014 explore their work and the techniques they apply it to.",
            "breadcrumb_parent_title"  => "Artists",
            "breadcrumb_parent_url"    => "/artists/",
            "breadcrumb_section_title" => "By Technology",
            "sitemap"          => true,
          }
        )
      end
    end

    def build_events_by_country(site)
      buckets = {}
      docs(site, "events").each do |e|
        slug = e.data["country_slug"]
        name = e.data["country"]
        next if slug.nil? || name.nil?
        (buckets[slug] ||= { name: name, count: 0 })[:count] += 1
      end
      buckets.each do |slug, info|
        site.pages << make_page(
          site,
          dir: "/events/by-country/#{slug}/",
          data: {
            "layout"           => "programmatic-list",
            "kind"             => "events_by_country",
            "value"            => info[:name],
            "slug"             => slug,
            "count"            => info[:count],
            "title"            => "VJ & Audiovisual Events in #{info[:name]}",
            "meta_title"       => "VJ & Audiovisual Events in #{info[:name]} | VJs TV",
            "meta_description" => truncate_meta("Live VJ performances, audiovisual festivals, and visual arts events in #{info[:name]}. #{info[:count]} listed on VJs TV \u2014 upcoming and past."),
            "intro"            => "Live VJ events, audiovisual festivals, and visual performances in #{info[:name]}. #{info[:count]} #{plural(info[:count], 'event')} listed on VJs TV \u2014 upcoming and past.",
            "breadcrumb_parent_title"  => "Events",
            "breadcrumb_parent_url"    => "/events/",
            "breadcrumb_section_title" => "By Country",
            "sitemap"          => true,
          }
        )
      end
    end

    def build_events_by_type(site)
      buckets = {}
      docs(site, "events").each do |e|
        slug = e.data["event_type_slug"]
        name = e.data["event_type"]
        next if slug.nil? || name.nil?
        (buckets[slug] ||= { name: name.to_s, count: 0 })[:count] += 1
      end
      buckets.each do |slug, info|
        site.pages << make_page(
          site,
          dir: "/events/by-type/#{slug}/",
          data: {
            "layout"           => "programmatic-list",
            "kind"             => "events_by_type",
            "value"            => info[:name],
            "slug"             => slug,
            "count"            => info[:count],
            "title"            => "#{info[:name]} \u2014 VJ Events",
            "meta_title"       => "#{info[:name]} VJ Events | Live Visual Performances",
            "meta_description" => truncate_meta("All #{info[:name].downcase} events on VJs TV \u2014 #{info[:count]} listed. Live VJ sets, audiovisual showcases, and visual performances worldwide."),
            "intro"            => "All events tagged #{info[:name]} on VJs TV. #{info[:count]} #{plural(info[:count], 'event')} \u2014 from intimate club nights to international festivals.",
            "breadcrumb_parent_title"  => "Events",
            "breadcrumb_parent_url"    => "/events/",
            "breadcrumb_section_title" => "By Type",
            "sitemap"          => true,
          }
        )
      end
    end

    def build_technology_projects(site)
      docs(site, "technology").each do |t|
        slug = t.data["title_slug"]
        next if slug.nil?
        title = t.data["title"]
        match_count = docs(site, "projects").count do |p|
          (p.data["matched_tech_slugs"] || []).include?(slug)
        end
        next if match_count < 1
        site.pages << make_page(
          site,
          dir: "/technology/#{slug}/projects/",
          data: {
            "layout"           => "programmatic-list",
            "kind"             => "tech_projects",
            "value"            => title,
            "slug"             => slug,
            "count"            => match_count,
            "tech_url"         => t.url,
            "title"            => "Projects Made With #{title}",
            "meta_title"       => "Projects Made With #{title} | VJs TV",
            "meta_description" => truncate_meta("#{match_count} VJ projects, audiovisual works, and live visual performances created with #{title}. Watch them on VJs TV."),
            "intro"            => "Audiovisual projects and VJ performances built with #{title}. #{match_count} #{plural(match_count, 'work')} on VJs TV \u2014 see how artists actually use the tool in production.",
            "breadcrumb_parent_title"  => "Technology",
            "breadcrumb_parent_url"    => "/technology/",
            "breadcrumb_section_title" => title,
            "breadcrumb_section_url"   => t.url,
            "sitemap"          => true,
          }
        )
      end
    end

    def make_page(site, dir:, data:)
      page = Jekyll::PageWithoutAFile.new(site, site.source, dir, "index.html")
      page.data.merge!(data)
      page.content = ""
      page
    end

    def docs(site, name)
      coll = site.collections[name]
      coll ? coll.docs : []
    end

    def plural(n, word)
      n == 1 ? word : "#{word}s"
    end

    def truncate_meta(s)
      s = s.to_s
      return s if s.length <= 158
      cut = s[0, 158]
      cut = cut.sub(/\s+\S*\z/, "")
      "#{cut}\u2026"
    end
  end
end
