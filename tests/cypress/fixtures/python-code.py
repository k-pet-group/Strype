# Adapted from Neil's side project so no issues with licensing:
# The only concession from the original is to add spaces around all operators to
# match what our code generation does (hence weird spacing around commas and dots):
content.delete(1.0,"end")

try:
    with open(save_file_path,"r") as f:
        save = json.load(f)

    # Find all the resource nodes on the level and infer the resource type (see resources.py):
    resources = [WOOD,CLEARANCE,DRIZZLE,STORM]
    for glade in save["world"]["glades"]:
        if len(glade["fields"])>0:
            resources.append(FARM_FIELD)
        for node in glade["ore"]:
            if node["model"]=="Copper Ore":
                resources.append(COPPER_ORE)

    for resource in save["world"]["resourcesDeposits"]:
        resource_type = resource["Value"]["model"]
        resource_name = ""
        for resource_tag in RESOURCE_NODE_TO_NAME.keys():
            if resource_tag in resource_type:
                resource_name = RESOURCE_NODE_TO_NAME[resource_tag]
                break
        if resource_name:
            resources.append(resource_name)
        else:
            raise Exception("Unknown resource type: "+resource_type)

    content.insert("end","Resources on map:\n")
    for resource in list(set(resources)):
        content.insert("end",resource+", ","available")
    content.insert("end","\n")

    available_buildings = []
    for building in save["content"]["buildings"]:
        if building in BUILDINGS_TO_RECIPES:
            available_buildings.append(building)
        else:
            raise Exception("Unknown building: "+building)

    # For now, just assume all blueprints are available:
    available_blueprints = BUILDINGS_TO_RECIPES

    content.insert("end","Available buildings:\n")
    for building in list(set(available_buildings)):
        if len(BUILDINGS_TO_RECIPES[building])>0:
            content.insert("end",building+", ","available")
    content.insert("end","\n\n")

    current_choice = []

    # Find the current offer of blueprints:
    for option in save["reputationRewards"]["currentPick"]["options"]:
        if option["building"] in BUILDINGS_TO_RECIPES:
            current_choice.append(option["building"])
        else:
            raise Exception("Unknown building type: "+option["building"])

    cached_availability = {}

    for o in current_choice:
        content.insert("end",f"{o}\n")
        for recipe in BUILDINGS_TO_RECIPES[o]:
            content.insert("end",f" \u2022 ")
            try:
                if isinstance(recipe,str):
                    insert_ingredient(content,(1,recipe))
                    content.insert("end","\n")
                else:
                    cur_index = content.index("end-1c")
                    a = insert_ingredient(content,recipe[0])
                    content.insert(cur_index," \u2190 ")
                    content.insert(cur_index,f"{str(recipe[1])}",a.name)
                    content.insert("end","\n")
            except Exception as e:
                content.insert("end",f"{e}","error")
    content.insert("end","Key:\n")
    for a in Availability:
        content.insert("end"," \u2022 ")
        if a==Availability.never_available:
            content.insert("end",a.name+": No way it can be available on this map",a.name)
        elif a==Availability.with_blueprint:
            content.insert("end",a.name+": Available only if you unlock the right blueprint in future",a.name)
        elif a==Availability.available:
            content.insert("end",a.name+": Available with the currently available set of buildings",a.name)
        content.insert("end","\n")
except Exception as e:
    content.insert("end",f"{e}","error")
finally:
    print("Finished!")
