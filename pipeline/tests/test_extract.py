from pipeline import extract


def stamped(when):
    return {"osm3s": {"timestamp_osm_base": when}, "elements": []}


def test_the_date_comes_from_the_data_not_the_clock():
    date = extract.data_date(
        stamped("2026-09-06T23:24:36Z"), stamped("2026-09-06T23:25:37Z")
    )
    assert date == "2026-09-06"


def test_the_oldest_piece_sets_the_date():
    date = extract.data_date(
        stamped("2026-09-06T23:24:36Z"), stamped("2026-08-31T01:57:55Z")
    )
    assert date == "2026-08-31"


def test_no_stamp_falls_back_to_today():
    date = extract.data_date({"elements": []})
    assert date == extract.dt.date.today().isoformat()
