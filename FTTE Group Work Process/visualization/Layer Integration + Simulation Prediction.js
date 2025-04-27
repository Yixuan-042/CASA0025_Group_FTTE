// ===============================
// Global style constants & helpers
// ===============================
var DEFAULT_FONT    = 'Arial';
var LABEL_FONT_SIZE = '12px';
var TITLE_FONT_SIZE = '14px';
var UI_STYLE        = {
  fontFamily: DEFAULT_FONT,
  fontSize: LABEL_FONT_SIZE
};

// keep the boundary layer on top
function bringBoundaryToFront() {
  Map.layers().remove(boundaryLayer);
  Map.layers().add(boundaryLayer);
}

// ===============================
// Load data & feature collections
// ===============================
var years = [2017,2018,2019,2020,2021,2022,2023];
var co2Paths = {
  2017:'users/HuitingChen/2017co2',
  2018:'users/HuitingChen/2018co2',
  2019:'users/HuitingChen/2019co2',
  2020:'users/HuitingChen/2020co2',
  2021:'users/HuitingChen/2021co2',
  2022:'users/HuitingChen/2022co2',
  2023:'users/HuitingChen/2023co2'
};
var populationFC  = ee.FeatureCollection('projects/ee-chenyixuan0402/assets/population0422');
var ntlFC         = ee.FeatureCollection('projects/ee-chenyixuan0402/assets/NTL0422');
var buildingStats = ee.FeatureCollection('projects/ee-chenyixuan0402/assets/BuildingGrid0424');
var districts     = ee.FeatureCollection('users/HuitingChen/GZ_boundaries');
Map.centerObject(districts, 9);

// ===============================
// Layer 1: District boundary layer
// ===============================
var boundaryStyle = {color:'white', width:1.2, fillColor:'00000000'};
var boundaryLayer = ui.Map.Layer(
  districts.style(boundaryStyle), {}, 'District Boundaries', true
);
Map.layers().add(boundaryLayer);

// ===============================
// Layer 2: Landcover Classification Layer
// ===============================

// Train random forest classifier
var esa = ee.ImageCollection('ESA/WorldCover/v100')
  .first().select('Map')
  .clip(districts);

var landsat9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
  .filterBounds(districts)
  .filterDate('2023-01-01', '2023-12-31')
  .filter(ee.Filter.lt('CLOUD_COVER', 10))
  .map(function(img) {
    var mask = img.select('QA_PIXEL').bitwiseAnd(1 << 3).eq(0);
    return img.updateMask(mask)
      .select(['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7'])
      .divide(10000)
      .copyProperties(img, ['system:time_start']);
  });

var composite = landsat9.median().clip(districts);

var samples = composite.addBands(esa).sample({
  region: districts.geometry(),
  scale: 30,
  numPixels: 5000,
  seed: 42,
  geometries: true
});

var classifier = ee.Classifier.smileRandomForest(50).train({
  features: samples,
  classProperty: 'Map',
  inputProperties: composite.bandNames()
});

var classified = composite.classify(classifier)
  .reproject({crs: 'EPSG:4326', scale: 30})
  .rename('landcover');

// Remap landcover codes to sequential classes (0-6)
var originalCodes = [10, 20, 30, 40, 50, 60, 80];
var remappedCodes = [0, 1, 2, 3, 4, 5, 6];

var remapped = classified.remap(originalCodes, remappedCodes);

// Define matching color palette
var landcoverPalette = [
  '#2E8B57', // 0 -> Forest
  '#9ACD32', // 1 -> Shrubland
  '#AFEEEE', // 2 -> Grassland
  '#F0E68C', // 3 -> Cropland
  '#87CEFA', // 4 -> Built-up
  '#C0C0C0', // 5 -> Bare/Sparse
  '#4682B4'  // 6 -> Water
];

// Visualize
var landcoverVis = remapped.visualize({
  min: 0,
  max: 6,
  palette: landcoverPalette,
  forceRgbOutput: true
});

// Add to Map
Map.layers().insert(1,
  ui.Map.Layer(landcoverVis, {}, 'Landcover Classification (Fixed)', false)
);
bringBoundaryToFront();

// ===============================
// Legend creation function
// ===============================
function createLegend(min, max, palette, title, units, customTicks) {
  var panel = ui.Panel({style:{
    padding:'10px',
    backgroundColor:'white',
    width:'310px'
  }});
  panel.add(ui.Label(title + (units?(' ('+units+')'):''), {
    fontWeight:'bold',
    fontFamily:DEFAULT_FONT,
    fontSize:TITLE_FONT_SIZE,
    textAlign:'center',
    width:'100%'
  }));
  panel.add(ui.Thumbnail({
    image: ee.Image.pixelLonLat().select(0)
      .multiply((max-min)/200).add(min)
      .visualize({min:min, max:max, palette:palette}),
    params:{bbox:[0,0,200,10], dimensions:'200x10'},
    style:{stretch:'horizontal', margin:'4px 0'}
  }));
  var ticks = customTicks || (function(){
    var step=(max-min)/4;
    return [min, min+step, min+2*step, min+3*step, max];
  })();
  var tickPanel = ui.Panel({layout: ui.Panel.Layout.flow('horizontal')});
  ticks.forEach(function(v){
    tickPanel.add(ui.Label(v.toFixed(2), UI_STYLE));
  });
  panel.add(tickPanel);
  return panel;
}

// ===============================
// Layer 3: CO₂ emission
// ===============================
var visParamsCO2 = {
  min:0, max:600,
  palette:['#440154','#3b528b','#21908d','#5dc962','#fde725']
};
var co2Images = {}, avgList = {};
years.forEach(function(y){
  var img = ee.Image(co2Paths[y]);
  co2Images[y] = img;
  avgList[y] = img.reduceRegion({
    reducer:ee.Reducer.mean(),
    geometry:img.geometry(),
    scale:1000, maxPixels:1e13
  }).getNumber('b1');
});

var defaultYear = 2023;
Map.layers().set(2,
  ui.Map.Layer(co2Images[defaultYear], visParamsCO2, 'CO₂ Emission', true)
);
bringBoundaryToFront();

// ===============================
// CO₂ UI panel
// ===============================
// Creating year selectors
var yearSelector = ui.Select({
  items: years.map(String),
  value: String(defaultYear),
  style: {
    stretch: 'horizontal',
    fontWeight: 'bold',
    fontSize: '14px',
    margin: '0',
    padding: '0',
    backgroundColor: 'rgba(0,0,0,0)'
  }
});

// Region of choice of year
var yearSection = ui.Panel({
  widgets: [
    ui.Label('Select year', {
      fontWeight: 'bold',
      fontSize: '14px',
      textAlign: 'left',
      stretch: 'horizontal',
      margin: '6px 0',
      padding: '0',
      backgroundColor: 'rgba(0,0,0,0)'
    }),
    yearSelector
  ],
  layout: ui.Panel.Layout.flow('vertical'),
  style: {
    width: '100%',
    margin: '0',
    padding: '0'
  }
});
var lineChart = ui.Chart.array.values({
    array: ee.Array(years.map(function(y){return [avgList[y]];})),
    axis:0, xLabels:years
  })
  .setChartType('LineChart')
  .setOptions({
    title:'Average CO₂ Emission Trend',
    hAxis:{ticks:years, textStyle:{fontSize:11}, format:'####'},
    vAxis:{title:'Average CO₂'},
    legend:{position:'none'},
    lineWidth:3, pointSize:5, fontSize:13,
    chartArea:{width:'85%',height:'70%'}
  });
var lineChartPanel = ui.Panel([lineChart]);
var districtChartPanel = ui.Panel(); 
districtChartPanel.style().set('shown', false);
var buttonLineChart = ui.Button({
    label:'City Avg Trend',
    style:{stretch:'horizontal',fontWeight:'bold',margin:'0 4px 0 0'},
    onClick:function(){
      lineChartPanel.style().set('shown', true);
      districtChartPanel.style().set('shown', false);
    }
  });
var buttonBarChart = ui.Button({
    label:'District CO₂ Distribution',
    style:{stretch:'horizontal',fontWeight:'bold',margin:'0 0 0 4px'},
    onClick:function(){
      lineChartPanel.style().set('shown', false);
      districtChartPanel.style().set('shown', true);
    }
  });
var chartButtonPanel = ui.Panel(
  [buttonLineChart, buttonBarChart],
  ui.Panel.Layout.flow('horizontal'),
  {margin:'8px 0'}
);
function updateDistrictChart(year){
  var chart = ui.Chart.image.byRegion(
      co2Images[year], districts, ee.Reducer.sum(), 1000, 'ENG_NAME'
    )
    .setChartType('ColumnChart')
    .setOptions({
      title:'District Total CO₂ – ' + year,
      hAxis:{slantedText:true},
      vAxis:{title:'Total CO₂'},
      legend:{position:'none'},
      fontSize:12
    });
  districtChartPanel.clear();
  districtChartPanel.add(chart);
  bringBoundaryToFront();
}
updateDistrictChart(defaultYear);
yearSelector.onChange(function(yStr){
  var y = parseInt(yStr,10);
  Map.layers().set(2,
    ui.Map.Layer(co2Images[y], visParamsCO2, 'CO₂ Emission', true)
  );
  updateDistrictChart(y);
  bringBoundaryToFront();
});
var co2Panel = ui.Panel(
  [yearSection, chartButtonPanel, lineChartPanel, districtChartPanel],
  ui.Panel.Layout.flow('vertical'), {
    position:'top-right',
    margin:'80px 10px 0 0',
    width:'360px',
    padding:'10px',
    backgroundColor:'rgba(255,255,255,0.9)',
    border:'1px solid #ccc',
    borderRadius:'10px'
  }
);
Map.add(co2Panel);

// ===============================
// Thematic layers preparation
// ===============================
var popImg    = populationFC.reduceToImage({
    properties:['RASTERVALU'], reducer:ee.Reducer.first()
  }).rename('pop_den');
var popMasked = popImg.updateMask(popImg.gt(0));
var ntlImg    = ntlFC.reduceToImage({
    properties:['RASTERVALU'], reducer:ee.Reducer.first()
  }).rename('NTL_intensity');
var ntlMasked = ntlImg.updateMask(ntlImg.gt(0));
var heightImg = buildingStats.reduceToImage({
    properties:['MeanHeight'], reducer:ee.Reducer.first()
  }).rename('MeanHeight');
var densImg   = buildingStats.reduceToImage({
    properties:['BuiDensity'], reducer:ee.Reducer.first()
  }).rename('BuiDensity');
var coverImg  = buildingStats.reduceToImage({
    properties:['BuiCover'], reducer:ee.Reducer.first()
  }).rename('BuiCover');

var pStats = popMasked.reduceRegion({
  reducer:ee.Reducer.percentile([5,95]),
  geometry:populationFC.geometry(),
  scale:1000, maxPixels:1e13
});
var min5  = ee.Number(pStats.get('pop_den_p5')).getInfo();
var max95 = ee.Number(pStats.get('pop_den_p95')).getInfo();

var visParamsDict = {
  'Population Density': {
    image: popMasked,
    vis: {min:min5, max:max95, palette:['lightyellow','orange','red','darkred']},
    units:'people/km²', band:'pop_den'
  },
  'Nighttime Lights': {
    image: ntlMasked,
    vis: {min:0, max:50, palette:['0000ff','8a2be2','ff0000','ffa500','ffff00','ffffff']},
    units:'', band:'NTL_intensity'
  },
  'Building Height': {
    image: heightImg,
    vis: {min:0, max:80, palette:['#ffffcc','#fd8d3c','#bd0026']},
    units:'m', band:'MeanHeight'
  },
  'Building Density': {
    image: densImg,
    vis: {min:0, max:1500, palette:['#edf8fb','#b2e2e2','#66c2a4','#238b45']},
    units:'', band:'BuiDensity'
  },
  'Footprint Ratio': {
    image: coverImg,
    vis: {min:0, max:1, palette:['#f7fcf0','#bae4bc','#238b45']},
    units:'', band:'BuiCover'
  },
  'CO₂ Emission': {
    image: co2Images[defaultYear],
    vis: visParamsCO2,
    units:'', band:'b1'
  }
};

// ===============================
// Left-side composite panel
// ===============================
// 1 Thematic selector panel
var selector = ui.Select({
  items: Object.keys(visParamsDict),
  value:'Population Density',
  style:{fontFamily:DEFAULT_FONT,fontSize:LABEL_FONT_SIZE,width:'80%',margin:'4px auto'}
});
var infoLabel = ui.Label('Click map for value',{
  fontFamily:DEFAULT_FONT,fontSize:LABEL_FONT_SIZE
});

// 2 Legend panel (CO₂)
var legendPanel = createLegend(
  visParamsCO2.min, visParamsCO2.max, visParamsCO2.palette,
  'CO₂ Emission','',[0,150,300,450,600]
);

// 3 Pie chart panel
var landcoverClasses = [
  {value:10, name:'Forest'},{value:20, name:'Shrubland'},{value:30, name:'Grassland'},
  {value:40, name:'Cropland'},{value:50, name:'Built-up'},{value:60, name:'Bare/Sparse'},
  {value:70, name:'Snow/Ice'},{value:80, name:'Water'},{value:90, name:'Herbaceous Wetland'},
  {value:95, name:'Mangroves'},{value:100,name:'Moss/Lichen'}
];
var histLC = ee.Dictionary(classified.reduceRegion({
  reducer: ee.Reducer.frequencyHistogram(),
  geometry: districts.geometry(),
  scale: 30, maxPixels:1e13
}).get('landcover'));
var pieChartData = landcoverClasses.map(function(c){
  var key = ee.String(ee.Number(c.value).format());
  var count = ee.Number(ee.Algorithms.If(histLC.contains(key), histLC.get(key), 0));
  return [c.name, count];
});
var landcoverPieChart = ui.Chart.array.values({
    array: ee.Array(pieChartData.map(function(d){return [d[1]];})),
    axis:0, xLabels:pieChartData.map(function(d){return d[0];})
  })
  .setChartType('PieChart')
  .setOptions({
    title:'Land Cover Proportion (2023)',
    titleTextStyle:{fontSize:14, bold:true},
    sliceVisibilityThreshold:0,
    pieSliceText:'percentage',
    legend:{position:'right', textStyle:{fontSize:12}},
    chartArea:{width:'70%',height:'70%'},
    fontSize:13
  });

// 4 Combine into leftPanel
var leftPanel = ui.Panel(
  [
    ui.Panel(
      [
        ui.Label('Thematic Layers',{fontWeight:'bold',fontSize:TITLE_FONT_SIZE,textAlign:'center'}),
        selector,
        infoLabel
      ],
      ui.Panel.Layout.flow('vertical'),
      {padding:'0', backgroundColor:'rgba(0,0,0,0)'}
    ),
    legendPanel,
    ui.Panel(
      [
        //ui.Label('Land Cover Proportion',{fontWeight:'bold',fontSize:'14px'}),
        landcoverPieChart
      ],
      ui.Panel.Layout.flow('vertical'),
      {padding:'0', backgroundColor:'rgba(0,0,0,0)'}
    )
  ],
  ui.Panel.Layout.flow('vertical'),
  {
    position:'top-left',
    margin:'0px 0 0 10px',
    padding:'8px',
    backgroundColor:'rgba(255,255,255,0.9)',
    border:'1px solid #ccc',
    borderRadius:'8px'
  }
);
Map.add(leftPanel);

// ===============================
// Hook up thematic selector & map click
// ===============================
var currentLayer;
selector.onChange(function(key) {
  var cfg = visParamsDict[key];
  if (currentLayer) Map.layers().remove(currentLayer);
  currentLayer = ui.Map.Layer(cfg.image, cfg.vis, key);
  Map.layers().add(currentLayer);
  infoLabel.setValue('Click map for ' + key);
  bringBoundaryToFront();
});
Map.onClick(function(coords) {
  var key = selector.getValue(), cfg = visParamsDict[key];
  cfg.image.sample(ee.Geometry.Point([coords.lon,coords.lat]),1000)
    .first().get(cfg.band).evaluate(function(v){
      infoLabel.setValue(
        key + ': ' + (v!==null?v.toFixed(2):'N/A') +
        (cfg.units?' '+cfg.units:'')
      );
    });
  bringBoundaryToFront();
});

// ===============================
// Predicting co2 emissions using random forest regression
// ===============================

var landcoverImg = classified.rename('landcover');
var populationImg = popMasked.rename('population');
var heightImg = heightImg;
var densityImg = densImg.rename('density');
var coverImg = coverImg;

// Feature engineering
var combo4Features = [
  'MeanHeight', 'population', 'density', 'BuiCover',
  'lc_10', 'lc_20', 'lc_30', 'lc_40', 'lc_50', 'lc_60', 'lc_80'
];

// Restricting the scope of reasoning to the central city
var coreDistricts = districts.filter(ee.Filter.inList('ENG_NAME', [
  'Tianhe', 'Yuexiu', 'Haizhu', 'Liwan', 'Baiyun', 'Huangpu'
]));

// Base feature image
var featureImg = ee.Image.cat([
  heightImg,
  populationImg,
  densityImg,
  coverImg,
  landcoverImg.eq(10).rename('lc_10'),
  landcoverImg.eq(20).rename('lc_20'),
  landcoverImg.eq(30).rename('lc_30'),
  landcoverImg.eq(40).rename('lc_40'),
  landcoverImg.eq(50).rename('lc_50'),
  landcoverImg.eq(60).rename('lc_60'),
  landcoverImg.eq(80).rename('lc_80'),
  co2Images[defaultYear].rename('RASTERVALU') 
]);

// Training Random Forests
var samples = featureImg.sample({
  region: coreDistricts.geometry(),
  scale: 1000,
  numPixels: 2000,
  seed: 42,
  geometries: true
}).filter(ee.Filter.notNull(combo4Features));

var rf = ee.Classifier.smileRandomForest(100)
  .setOutputMode('REGRESSION')
  .train({
    features: samples,
    classProperty: 'RASTERVALU',
    inputProperties: combo4Features
  });

// Predict raw baseline
var baselinePred = featureImg.select(combo4Features).classify(rf);

// UI Interface - Combination Selection
var scenarioSelect = ui.Select({
  items: [
    'Built-up ➔ Forest (20%)',
    'Cropland ➔ Built-up (10%)',
    'Bare ➔ Shrubland (50%)'
  ],
  value: 'Built-up ➔ Forest (20%)',
  style: {
    stretch: 'horizontal',
    fontWeight: 'bold',
    fontSize: '14px'
  }
});

// predictor button
var applyButton = ui.Button({
  label: 'Apply Change & Predict',
  style: {
    stretch: 'horizontal',
    fontWeight: 'bold'
  },
  onClick: function(){
    var selected = scenarioSelect.getValue();
    
    var modifiedLandcover;
    
    if (selected === 'Built-up ➔ Forest (20%)') {
      modifiedLandcover = landcoverImg.where(
        landcoverImg.eq(50).and(ee.Image.random().lt(0.2)),
        10
      );
    }
    if (selected === 'Cropland ➔ Built-up (10%)') {
      modifiedLandcover = landcoverImg.where(
        landcoverImg.eq(40).and(ee.Image.random().lt(0.1)),
        50
      );
    }
    if (selected === 'Bare ➔ Shrubland (50%)') {
      modifiedLandcover = landcoverImg.where(
        landcoverImg.eq(60).and(ee.Image.random().lt(0.5)),
        20
      );
    }
    
    var newFeatureImg = ee.Image.cat([
      heightImg,
      populationImg,
      densityImg,
      coverImg,
      modifiedLandcover.eq(10).rename('lc_10'),
      modifiedLandcover.eq(20).rename('lc_20'),
      modifiedLandcover.eq(30).rename('lc_30'),
      modifiedLandcover.eq(40).rename('lc_40'),
      modifiedLandcover.eq(50).rename('lc_50'),
      modifiedLandcover.eq(60).rename('lc_60'),
      modifiedLandcover.eq(80).rename('lc_80')
    ]);
    
    var newPred = newFeatureImg.select(combo4Features).classify(rf);
    
    var diff = newPred.subtract(baselinePred);
    
    Map.addLayer(diff.clip(coreDistricts), {
      min: -100, max: 100,
      palette: ['blue','white','red']
    }, 'CO₂ Change: ' + selected);
  }
});

// Combine to panel
var predictPanel = ui.Panel({
  widgets: [
    ui.Label('Fixed Landcover Change Prediction', {
      fontWeight: 'bold',
      fontSize: '16px',
      margin: '0 0 6px 0'
    }),
    scenarioSelect,
    applyButton,
    ui.Label('🟦 Decrease in CO₂\n🟥 Increase in CO₂', {
      fontSize: '12px',
      margin: '8px 0 0 0',
      textAlign: 'left',
      whiteSpace: 'pre'
    }),
    ui.Label('(Based on Random Forest Regression Model)', {
      fontSize: '10px',
      margin: '4px 0 0 0',
      color: 'gray',
      textAlign: 'left'
    })
  ],
  style: {
    position: 'top-right', 
    margin: '470px 10px 0 0',
    padding: '10px',
    width: '360px',
    backgroundColor: 'rgba(255,255,255,0.9)',
    border: '1px solid #ccc',
    borderRadius: '8px'
  }
});
Map.add(predictPanel);